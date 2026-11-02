import { db } from '@/lib/supabase'
import type { InspectionLine, InspectionMap } from '@/lib/domain/types'
import { fetchAll, unwrap } from './core'

export const listInspectionMaps = () => fetchAll<InspectionMap>((a, b) => db.from('inspection_maps').select('*').order('created_at', { ascending: false }).range(a, b))
export async function getInspectionMap(id: string) {
  const [m, l] = await Promise.all([db.from('inspection_maps').select('*').eq('id', id).single(), db.from('inspection_map_lines').select('*').eq('map_id', id).order('position')])
  return { map: unwrap(m) as InspectionMap, lines: unwrap(l) as InspectionLine[] }
}
export type MapHeader = Pick<InspectionMap, 'title' | 'vessel_name' | 'voyage_ref' | 'bl_ref' | 'port_location' | 'cargo_description' | 'cargo_owner' | 'inspection_date' | 'tolerance_pct' | 'notes'>
export async function createInspectionMap(orgId: string, userId: string, h: MapHeader): Promise<string> {
  const r = unwrap(await db.from('inspection_maps').insert({ ...h, organization_id: orgId, created_by: userId, inspector_id: userId }).select('id').single()) as { id: string }
  return r.id
}
export const updateInspectionHeader = async (id: string, h: MapHeader) => unwrap(await db.from('inspection_maps').update(h).eq('id', id))

export type LineForm = Omit<InspectionLine, 'id' | 'map_id' | 'diff_qty' | 'good_qty' | 'diff_pct' | 'line_weight_kg'> & { id?: string }
/** Grava linhas sem perda: actualiza/insere primeiro e só depois remove as que saíram. As colunas calculadas vêm do servidor. */
export async function saveLines(mapId: string, lines: LineForm[], existingIds: string[]) {
  const keep = new Set<string>()
  for (const [i, l] of lines.entries()) {
    const row = { position: i + 1, hold_ref: l.hold_ref || null, item_description: l.item_description, lot_ref: l.lot_ref || null, unit: l.unit, declared_qty: l.declared_qty, counted_qty: l.counted_qty, damaged_qty: l.damaged_qty, unit_weight_kg: l.unit_weight_kg ?? null, condition: l.condition || null, notes: l.notes || null }
    if (l.id) { keep.add(l.id); unwrap(await db.from('inspection_map_lines').update({ ...row, position: 10_000 + i }).eq('id', l.id)) } // posições temporárias evitam colisões
    else unwrap(await db.from('inspection_map_lines').insert({ ...row, map_id: mapId, position: 20_000 + i }))
  }
  for (const id of existingIds) if (!keep.has(id)) unwrap(await db.from('inspection_map_lines').delete().eq('id', id))
  const cur = unwrap(await db.from('inspection_map_lines').select('id,position').eq('map_id', mapId).order('position')) as { id: string; position: number }[]
  for (const [i, c] of cur.entries()) unwrap(await db.from('inspection_map_lines').update({ position: i + 1 }).eq('id', c.id))
}
export const submitInspectionMap = async (id: string) => unwrap(await db.rpc('submit_inspection_map', { p_map: id }))
export const reviewInspectionMap = async (id: string, result: 'approved' | 'returned', note?: string) => unwrap(await db.rpc('review_inspection_map', { p_map: id, p_result: result, p_note: note ?? null }))

import { db } from '@/lib/supabase'
import type { HoldScan, ScanMethod, ScanValidation } from '@/lib/domain/types'
import { DEFAULT_CRITERIA, type Criteria } from '@/modules/holdscan/validation'
import { fetchAll, unwrap } from './core'

export const listScans = () => fetchAll<HoldScan>((a, b) => db.from('hold_scans').select('*').order('created_at', { ascending: false }).range(a, b))
export const listValidations = () => fetchAll<ScanValidation>((a, b) => db.from('scan_validations').select('*').order('measured_at', { ascending: false }).range(a, b))
export async function getCriteria(): Promise<Criteria> {
  const r = await db.from('platform_settings').select('value').eq('key', 'scan_validation_criteria').maybeSingle()
  return { ...DEFAULT_CRITERIA, ...((r.data as { value?: Partial<Criteria> } | null)?.value ?? {}) }
}

export interface SaveScanInput { orgId: string; userId: string; mapId?: string | null; title: string; holdRef?: string; method: ScanMethod; device: Record<string, unknown>; stats: Record<string, unknown>; notes?: string; model?: { data: ArrayBuffer; format: 'ply' | 'obj' | 'json' } }
export async function saveScan(i: SaveScanInput): Promise<string> {
  let path: string | null = null
  if (i.model) {
    path = `${i.orgId}/${crypto.randomUUID()}/modelo.${i.model.format}`
    const up = await db.storage.from('scans').upload(path, new Blob([i.model.data]), { contentType: 'application/octet-stream', upsert: false })
    if (up.error) throw new Error(up.error.message)
  }
  const r = await db.from('hold_scans').insert({ organization_id: i.orgId, inspection_map_id: i.mapId ?? null, title: i.title, hold_ref: i.holdRef || null, method: i.method, device: i.device, stats: i.stats, model_path: path, model_format: i.model?.format ?? null, model_bytes: i.model?.data.byteLength ?? null, notes: i.notes ?? null, created_by: i.userId }).select('id').single()
  if (r.error) { if (path) await db.storage.from('scans').remove([path]); throw new Error(r.error.message) }
  return (r.data as { id: string }).id
}
export async function downloadScanModel(path: string): Promise<ArrayBuffer> {
  const { data, error } = await db.storage.from('scans').createSignedUrl(path, 60)
  if (error || !data) throw new Error(error?.message ?? 'NOT_FOUND')
  return (await fetch(data.signedUrl)).arrayBuffer()
}
export interface ValidationInput { orgId: string; userId: string; scanId?: string | null; deviceLabel: string; method: ScanMethod; reference: string; physical: number; instrument?: string; uncertainty?: number | null; scanned: number; conditions?: string }
export const addValidation = async (i: ValidationInput) => unwrap(await db.from('scan_validations').insert({ organization_id: i.orgId, scan_id: i.scanId ?? null, device_label: i.deviceLabel, method: i.method, reference_label: i.reference, physical_value: i.physical, physical_instrument: i.instrument || null, physical_uncertainty: i.uncertainty ?? null, scanned_value: i.scanned, conditions: i.conditions || null, measured_by: i.userId }))

import { db } from '@/lib/supabase'
import type { Category, DocumentType, QualificationRequirement } from '@/lib/domain/types'
import { unwrap } from './core'

export const getCategories = async () => unwrap(await db.from('categories').select('*').order('sort_order')) as Category[]
export const getDocumentTypes = async () => unwrap(await db.from('document_types').select('*').order('sort_order')) as DocumentType[]
export const getRequirements = async () => unwrap(await db.from('qualification_requirements').select('*').order('name')) as QualificationRequirement[]
export async function getSettings(): Promise<Record<string, unknown>> {
  const rows = unwrap(await db.from('platform_settings').select('*')) as { key: string; value: unknown }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// Administração (RLS: só superadministrador)
export const saveCategory = async (c: Partial<Category> & { name: string; slug: string }) =>
  unwrap(c.id ? await db.from('categories').update(c).eq('id', c.id) : await db.from('categories').insert(c))
export const saveDocumentType = async (t: Partial<DocumentType> & { name: string; code: string }) =>
  unwrap(t.id ? await db.from('document_types').update(t).eq('id', t.id) : await db.from('document_types').insert(t))
export const saveRequirement = async (r: Partial<QualificationRequirement> & { name: string; document_type_id: string }) =>
  unwrap(r.id ? await db.from('qualification_requirements').update(r).eq('id', r.id) : await db.from('qualification_requirements').insert(r))
export const saveSetting = async (key: string, value: unknown) => unwrap(await db.from('platform_settings').upsert({ key, value }, { onConflict: 'key' }))

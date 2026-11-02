/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/supabase'
import type { AppRole, DirectoryEntry, Organization, Service } from '@/lib/domain/types'
import { cleanTerm, fetchAll, unwrap } from './core'

export const getOrganization = async (id: string) => unwrap(await db.from('organizations').select('*').eq('id', id).single()) as Organization
export async function updateOrganization(id: string, values: Partial<Organization>) {
  unwrap(await db.from('organizations').update(values).eq('id', id))
}
export const listServices = async (orgId: string) => unwrap(await db.from('services').select('*').eq('organization_id', orgId).order('name')) as Service[]
export async function saveService(orgId: string, s: Partial<Service> & { name: string; category_id: string }) {
  const row = { organization_id: orgId, name: s.name, category_id: s.category_id, description: s.description ?? null, specialties: s.specialties ?? [], areas: s.areas ?? [] }
  unwrap(s.id ? await db.from('services').update(row).eq('id', s.id) : await db.from('services').insert(row))
}
export const deleteService = async (id: string) => unwrap(await db.from('services').delete().eq('id', id))
export const submitProfile = async (orgId: string) => unwrap(await db.rpc('submit_profile', { p_org: orgId }))

export interface DirectoryFilters { q?: string; province?: string; categoryId?: string; verifiedOnly?: boolean; docTypeId?: string; page?: number; pageSize?: number }
export async function searchDirectory(f: DirectoryFilters) {
  const size = f.pageSize ?? 12, page = f.page ?? 0
  let q = db.from('supplier_directory').select('*', { count: 'exact' }).in('org_type', ['supplier', 'both'])
  const term = f.q ? cleanTerm(f.q) : ''
  if (term) q = q.or(`legal_name.ilike.%${term}%,trade_name.ilike.%${term}%,service_text.ilike.%${term}%,sector.ilike.%${term}%`)
  if (f.province) q = q.eq('province', f.province)
  if (f.categoryId) q = q.contains('category_ids', [f.categoryId])
  if (f.verifiedOnly) q = q.eq('verification_status', 'verified')
  if (f.docTypeId) q = q.contains('valid_doc_type_ids', [f.docTypeId])
  const res = await q.order('legal_name').range(page * size, page * size + size - 1)
  if (res.error) throw new Error(res.error.message)
  return { rows: (res.data ?? []) as DirectoryEntry[], count: res.count ?? 0 }
}
export const getDirectoryEntry = async (id: string) => unwrap(await db.from('supplier_directory').select('*').eq('id', id).maybeSingle()) as DirectoryEntry | null
export const getEntryServices = async (id: string) => listServices(id)
export const listEligibleSuppliers = async () =>
  fetchAll<DirectoryEntry>((a, b) => db.from('supplier_directory').select('*').in('org_type', ['supplier', 'both']).eq('profile_status', 'approved').order('legal_name').range(a, b))

// Administração de organizações (superadministrador)
export const adminListOrganizations = () => fetchAll<Organization>((a, b) => db.from('organizations').select('*').order('created_at', { ascending: false }).range(a, b))
export const reviewProfile = async (org: string, result: string, reason?: string) => unwrap(await db.rpc('review_profile', { p_org: org, p_result: result, p_reason: reason ?? null }))
export const setVerification = async (org: string, status: string, scope?: string) => unwrap(await db.rpc('set_verification', { p_org: org, p_status: status, p_scope: scope ?? null }))
export const setOrgActive = async (org: string, active: boolean) => unwrap(await db.rpc('admin_set_org_active', { p_org: org, p_active: active }))

// Membros
export interface Member { member_id: string; user_id: string; full_name: string; email: string | null; role: AppRole; is_active: boolean; created_at: string }
export const listMembers = async (orgId: string) => unwrap(await db.rpc('list_org_members', { p_org: orgId })) as Member[]
export const addMember = async (orgId: string, email: string, role: AppRole) => unwrap(await db.rpc('add_member', { p_org: orgId, p_email: email, p_role: role }))
export const setMemberActive = async (id: string, active: boolean) => unwrap(await db.rpc('set_member_active', { p_member: id, p_active: active }))
export interface PlatformUser { id: string; full_name: string; email: string; is_superadmin: boolean; is_active: boolean; organizations: number; created_at: string }
export const adminListUsers = async () => unwrap(await db.rpc('admin_list_users')) as PlatformUser[]
export const adminSetUserActive = async (id: string, active: boolean) => unwrap(await db.rpc('admin_set_user_active', { p_user: id, p_active: active }))

export async function updateMyProfile(id: string, v: { full_name: string; phone: string | null; job_title: string | null }) {
  unwrap(await db.from('profiles').update(v).eq('id', id))
}
export type { Organization }

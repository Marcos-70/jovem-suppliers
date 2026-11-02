import { db } from '@/lib/supabase'
import type { AuditLog } from '@/lib/domain/types'
import { unwrap } from './core'

export interface AuditFilters { orgId?: string; entityId?: string; entityType?: string; from?: string; to?: string; page?: number; pageSize?: number }
export async function listAudit(f: AuditFilters) {
  const size = f.pageSize ?? 25, page = f.page ?? 0
  let q = db.from('audit_logs').select('*', { count: 'exact' })
  if (f.orgId) q = q.eq('organization_id', f.orgId)
  if (f.entityType) q = q.eq('entity_type', f.entityType)
  if (f.entityId) q = q.eq('entity_id', f.entityId)
  if (f.from) q = q.gte('created_at', f.from)
  if (f.to) q = q.lte('created_at', f.to + 'T23:59:59Z')
  const res = await q.order('created_at', { ascending: false }).range(page * size, page * size + size - 1)
  return { rows: unwrap(res) as AuditLog[], count: res.count ?? 0 }
}
export async function runAlertJobs() { return unwrap(await db.rpc('generate_alerts')) as { novas_notificacoes: number } }

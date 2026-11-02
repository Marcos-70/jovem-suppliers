/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/supabase'
import type { ReportData } from '@/lib/domain/reports'
import type { AuditLog, DocumentRow } from '@/lib/domain/types'
import { fetchAll, unwrap } from './core'
import { getCategories, getDocumentTypes, getRequirements, getSettings } from './catalog'

/**
 * Carrega os dados de origem para painéis e relatórios. Tudo passa pelas regras RLS:
 * cada perfil só obtém o que lhe é permitido. O superadministrador recebe factos
 * agregados de pedidos/propostas, sem valores nem textos comerciais.
 */
export async function loadReportData(isSuper: boolean): Promise<ReportData> {
  const [categories, documentTypes, requirements, settings] = await Promise.all([getCategories(), getDocumentTypes(), getRequirements(), getSettings()])
  const orgsPromise = isSuper
    ? fetchAll<any>((a, b) => db.from('organizations').select('*').range(a, b))
    : fetchAll<any>((a, b) => db.from('supplier_directory').select('*').range(a, b))
  const [orgs, services, documents, reviews, versions, audit, profiles] = await Promise.all([
    orgsPromise,
    fetchAll<any>((a, b) => db.from('services').select('organization_id,category_id').range(a, b)),
    fetchAll<DocumentRow>((a, b) => db.from('documents').select('*').range(a, b)),
    fetchAll<any>((a, b) => db.from('document_reviews').select('document_id,version_id,reviewed_at,result').range(a, b)),
    fetchAll<any>((a, b) => db.from('document_versions').select('id,submitted_at').range(a, b)),
    fetchAll<AuditLog>((a, b) => db.from('audit_logs').select('*').order('created_at', { ascending: false }).range(a, Math.min(b, 1999))).catch(() => [] as AuditLog[]),
    fetchAll<any>((a, b) => db.from('profiles').select('id,full_name').range(a, b)),
  ])
  let opportunities: any[], proposals: any[], decisions: any[], extensions: any[] = [], invitations: any[] = []
  if (isSuper) {
    ;[opportunities, proposals, decisions] = await Promise.all([
      db.rpc('admin_opportunity_facts').then(unwrap) as Promise<any[]>, db.rpc('admin_proposal_facts').then(unwrap) as Promise<any[]>, db.rpc('admin_decision_facts').then(unwrap) as Promise<any[]>,
    ])
  } else {
    ;[opportunities, proposals, decisions, extensions, invitations] = await Promise.all([
      fetchAll<any>((a, b) => db.from('opportunities').select('*').range(a, b)), fetchAll<any>((a, b) => db.from('proposals').select('*').neq('status', 'draft').range(a, b)),
      fetchAll<any>((a, b) => db.from('commercial_decisions').select('*').range(a, b)), fetchAll<any>((a, b) => db.from('deadline_extensions').select('*').range(a, b)),
      fetchAll<any>((a, b) => db.from('supplier_invitations').select('*').range(a, b)),
    ])
  }
  const vSubmitted = new Map(versions.map((v: any) => [v.id, v.submitted_at]))
  return {
    now: new Date(), organizations: orgs.map((o: any) => ({ is_active: true, ...o })), services, documents, documentTypes, requirements, categories,
    reviews: reviews.filter((r: any) => vSubmitted.has(r.version_id)).map((r: any) => ({ document_id: r.document_id, submitted_at: vSubmitted.get(r.version_id) as string, reviewed_at: r.reviewed_at, result: r.result })),
    opportunities, extensions, proposals, decisions, invitations, audit, userNames: Object.fromEntries(profiles.map((p: any) => [p.id, p.full_name])),
    requiredFields: (settings.profile_required_fields as string[] | undefined) ?? undefined,
  }
}

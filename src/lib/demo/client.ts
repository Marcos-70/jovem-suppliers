/* eslint-disable @typescript-eslint/no-explicit-any */
// Substituto em memória do cliente Supabase, APENAS para o modo DEMONSTRAÇÃO.
// Não persiste dados (reiniciam ao recarregar), não aplica RLS e simplifica regras.
// A segurança real é a das migrações SQL (testadas em supabase/tests).
import { ROLE_PERMISSIONS } from '../domain/permissions'
import { calcLine } from '../domain/proposal'
import { finalDeadline, allowedTransitions } from '../domain/opportunity'
import { missingProfileFields } from '../domain/profile'
import { calcInspectionLine } from '../domain/inspection'
import { createSeed, uid, type DemoStore, type Row } from './seed'

const store: DemoStore = createSeed()
const SESSION_KEY = 'jovem-demo-user'
type Result = { data: any; error: { message: string } | null; count?: number | null }
const fail: (code: string) => never = (code) => { throw new Error(code) }
let counter = 5000
const newId = (k: string) => uid(k, ++counter)
const me = () => store.currentUserId
const T = (name: string): Row[] => (store.tables[name] ??= [])
const nowIso = () => new Date().toISOString()
/** Replica as colunas calculadas (GENERATED) e valores por omissão do servidor. */
function applyServerRules(table: string, row: Row) {
  if (table === 'inspection_map_lines') {
    const c = calcInspectionLine({ declared: row.declared_qty ?? 0, counted: row.counted_qty ?? 0, damaged: row.damaged_qty ?? 0, unitWeight: row.unit_weight_kg })
    Object.assign(row, { diff_qty: c.diff, good_qty: c.good, diff_pct: c.diffPct, line_weight_kg: c.weightKg })
  }
  if (table === 'scan_validations') {
    row.error_abs = Math.round((row.scanned_value - row.physical_value) * 10000) / 10000
    row.error_pct = Math.round(((row.scanned_value - row.physical_value) * 100 / row.physical_value) * 1000) / 1000
  }
}
const files = new Map<string, Blob>() // armazenamento em memória
const listeners = new Set<(event: string, session: any) => void>()

function session() {
  const u = store.users.find((x) => x.id === store.currentUserId)
  return u ? { access_token: 'demo', user: { id: u.id, email: u.email, user_metadata: { full_name: u.full_name } } } : null
}
const emit = (event: string) => listeners.forEach((l) => l(event, session()))

/* ----------------------------------------------------------- Consulta */
class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filters: ((r: Row) => boolean)[] = []
  private payload: any
  private orderBy: { col: string; asc: boolean }[] = []
  private from_ = 0
  private to_ = Infinity
  private wantCount = false
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private returning = false
  private conflict: string[] = []
  constructor(private table: string) {}

  select(_c?: string, o?: { count?: string; head?: boolean }) { if (this.op !== 'select') this.returning = true; if (o?.count) this.wantCount = true; return this }
  insert(v: any) { this.op = 'insert'; this.payload = v; return this }
  upsert(v: any, o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = v; this.conflict = (o?.onConflict ?? 'id').split(','); return this }
  update(v: any) { this.op = 'update'; this.payload = v; return this }
  delete() { this.op = 'delete'; return this }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this }
  in(c: string, v: any[]) { this.filters.push((r) => v.includes(r[c])); return this }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this }
  not(c: string, op: string, v: any) { if (op === 'is') this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v)); return this }
  ilike(c: string, p: string) { const re = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i'); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this }
  contains(c: string, v: any[]) { this.filters.push((r) => v.every((x) => (r[c] ?? []).includes(x))); return this }
  overlaps(c: string, v: any[]) { this.filters.push((r) => v.some((x) => (r[c] ?? []).includes(x))); return this }
  or(expr: string) {
    const parts = expr.split(',').map((p) => p.split('.'))
    this.filters.push((r) => parts.some(([c, op, ...rest]) => { const val = rest.join('.'); if (op === 'ilike') return new RegExp(val.replace(/%/g, '.*'), 'i').test(String(r[c] ?? '')); if (op === 'eq') return String(r[c]) === val; return false }))
    return this
  }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy.push({ col, asc: o?.ascending !== false }); return this }
  range(a: number, b: number) { this.from_ = a; this.to_ = b; return this }
  limit(n: number) { this.to_ = this.from_ + n - 1; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }

  private rows(): Row[] { return this.table === 'supplier_directory' ? directory() : scope(this.table, T(this.table)) }

  private run(): Result {
    try {
      const all = this.rows()
      const matched = all.filter((r) => this.filters.every((f) => f(r)))
      if (this.op === 'insert' || this.op === 'upsert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
        const out: Row[] = []
        for (const v of list) {
          if (this.op === 'upsert') {
            const ex = all.find((r) => this.conflict.every((k) => r[k] === v[k]))
            if (ex) { Object.assign(ex, v); out.push(ex); continue }
          }
          const row: Row = { id: newId(this.table.slice(0, 3)), created_at: nowIso(), ...v }
          if (this.table === 'opportunities') { row.number = `RFQ-2026-${String(++store.seq.opp).padStart(5, '0')}`; row.status = 'draft'; row.sealed_until_deadline ??= true; row.required_document_type_ids ??= []; row.updated_at = nowIso() }
          if (this.table === 'inspection_maps') Object.assign(row, { number: `MCI-2026-${String(++store.seq.insp).padStart(5, '0')}`, status: 'draft', tolerance_pct: row.tolerance_pct ?? 0.5, inspection_date: row.inspection_date ?? new Date().toISOString().slice(0, 10), updated_at: nowIso(), submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null })
          if (this.table === 'inspection_map_lines') Object.assign(row, { unit: row.unit ?? 'un', declared_qty: row.declared_qty ?? 0, counted_qty: row.counted_qty ?? 0, damaged_qty: row.damaged_qty ?? 0 })
          if (this.table === 'inspection_map_lines' && row.damaged_qty > row.counted_qty) throw new Error('inspection_map_lines_check')
          if (this.table === 'scan_validations' || this.table === 'inspection_map_lines') applyServerRules(this.table, row)
          if (this.table === 'notification_preferences') delete row.id
          T(this.table).push(row); out.push(row)
        }
        return this.shape(out)
      }
      if (this.op === 'update') {
        if (this.table === 'scan_validations') throw new Error('permission denied')
        matched.forEach((r) => { if (this.table === 'inspection_map_lines' && !editableMap(r.map_id)) return; if (this.table === 'inspection_maps' && !['draft', 'returned'].includes(r.status)) return; Object.assign(r, this.payload, { updated_at: nowIso() }); applyServerRules(this.table, r) })
        return this.shape(matched)
      }
      if (this.op === 'delete') {
        if (this.table === 'scan_validations') throw new Error('permission denied')
        const del = matched.filter((r) => this.table !== 'inspection_map_lines' || editableMap(r.map_id))
        store.tables[this.table] = T(this.table).filter((r) => !del.includes(r)); return this.shape(del)
      }
      let out = [...matched]
      for (const o of [...this.orderBy].reverse()) out.sort((a, b) => (a[o.col] === b[o.col] ? 0 : (a[o.col] ?? '') > (b[o.col] ?? '') ? 1 : -1) * (o.asc ? 1 : -1))
      const count = out.length
      out = out.slice(this.from_, this.to_ === Infinity ? undefined : this.to_ + 1)
      return { ...this.shape(out), count: this.wantCount ? count : null }
    } catch (e) { return { data: null, error: { message: (e as Error).message } } }
  }
  private shape(rows: Row[]): Result {
    const copy = rows.map((r) => ({ ...r }))
    if (this.mode === 'single') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: 'NOT_FOUND' } }
    if (this.mode === 'maybe') return { data: copy[0] ?? null, error: null }
    if ((this.op === 'insert' || this.op === 'update' || this.op === 'upsert' || this.op === 'delete') && !this.returning) return { data: null, error: null }
    return { data: copy, error: null }
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, no?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, no)
  }
}

/* ------------------------------------------------ Vista supplier_directory */
function directory(): Row[] {
  const uidNow = me()
  const myOrgs = T('organization_members').filter((m) => m.user_id === uidNow && m.is_active).map((m) => m.organization_id)
  const isSuper = store.users.find((u) => u.id === uidNow)?.is_superadmin
  const related = new Set<string>()
  if (myOrgs.length) {
    const myOpps = T('opportunities').filter((o) => myOrgs.includes(o.buyer_org_id) && o.status !== 'draft').map((o) => o.id)
    T('supplier_invitations').filter((i) => myOpps.includes(i.opportunity_id)).forEach((i) => related.add(i.supplier_org_id))
    T('proposals').filter((p) => myOpps.includes(p.opportunity_id) && p.status !== 'draft').forEach((p) => related.add(p.supplier_org_id))
    T('supplier_invitations').filter((i) => myOrgs.includes(i.supplier_org_id)).forEach((i) => { const o = T('opportunities').find((x) => x.id === i.opportunity_id); if (o) related.add(o.buyer_org_id) })
  }
  return T('organizations').filter((o) => {
    if (!o.is_active) return false
    const listed = o.profile_status === 'approved' && o.visibility !== 'private' && o.visibility_consent_at && (o.visibility === 'public' || uidNow)
    return listed || myOrgs.includes(o.id) || isSuper || related.has(o.id)
  }).map((o) => {
    const own = myOrgs.includes(o.id) || isSuper
    const show = (f: string) => own || (o.public_fields ?? []).includes(f)
    const svcs = T('services').filter((s) => s.organization_id === o.id)
    return {
      id: o.id, legal_name: o.legal_name, trade_name: o.trade_name, org_type: o.org_type, sector: o.sector, province: o.province, municipality: o.municipality, description: o.description,
      founded_year: o.founded_year, profile_status: o.profile_status, verification_status: o.verification_status, verification_scope: o.verification_scope, verified_at: o.verified_at,
      visibility: o.visibility, profile_updated_at: o.profile_updated_at,
      nif: show('nif') ? o.nif : null, address: show('address') ? o.address : null, phone: show('phone') ? o.phone : null, email: show('email') ? o.email : null,
      website: show('website') ? o.website : null, contact_person: show('contact_person') ? o.contact_person : null, employee_count: show('employee_count') ? o.employee_count : null,
      capabilities: show('capabilities') ? o.capabilities : null, certifications_declared: show('certifications') ? o.certifications_declared : [],
      category_ids: [...new Set(svcs.map((s) => s.category_id))], service_text: svcs.map((s) => `${s.name} ${(s.specialties ?? []).join(' ')}`).join(' '), service_count: svcs.length,
      valid_doc_type_ids: show('compliance') ? [...new Set(T('documents').filter((d) => d.organization_id === o.id && d.status === 'approved' && (!d.valid_until || d.valid_until >= new Date().toISOString().slice(0, 10))).map((d) => d.document_type_id))] : [],
    }
  })
}


function editableMap(id: string): boolean {
  const m = T('inspection_maps').find((x) => x.id === id)
  return !!m && ['draft', 'returned'].includes(m.status) && orgsWith('inspection.create').includes(m.organization_id) && (m.created_by === me() || m.inspector_id === me() || orgsWith('inspection.review').includes(m.organization_id))
}
/* ------------------------------------- Isolamento (equivalente às políticas RLS) */
function orgsWith(perm: string): string[] {
  return [...new Set(myMemberships().filter((m) => (ROLE_PERMISSIONS[m.role] ?? []).includes(perm)).map((m) => m.organization_id))]
}
function canViewOpp(o: Row): boolean {
  if (orgsWith('opportunity.view').includes(o.buyer_org_id)) return true
  if (o.status !== 'draft' && T('supplier_invitations').some((i) => i.opportunity_id === o.id && orgsWith('opportunity.view').includes(i.supplier_org_id))) return true
  if (['open', 'clarification'].includes(o.status) && o.visibility === 'open_to_qualified')
    return orgsWith('opportunity.view').some((id) => { const g = T('organizations').find((x) => x.id === id); return g && ['supplier', 'both'].includes(g.org_type) && g.profile_status === 'approved' })
  return false
}
function canViewProposal(p: Row): boolean {
  if (orgsWith('proposal.view').includes(p.supplier_org_id)) return true
  const o = T('opportunities').find((x) => x.id === p.opportunity_id)
  if (!o || p.status === 'draft' || !orgsWith('proposal.view').includes(o.buyer_org_id)) return false
  return !o.sealed_until_deadline || Date.now() >= oppFinalDeadline(o.id).getTime()
}
function canViewDoc(d: Row): boolean {
  if (orgsWith('document.view').includes(d.organization_id) || isSuper()) return true
  return d.status === 'approved' && T('proposals').some((p) => p.supplier_org_id === d.organization_id && p.status !== 'draft' && orgsWith('document.view').includes(T('opportunities').find((o) => o.id === p.opportunity_id)?.buyer_org_id))
}
function scope(table: string, rows: Row[]): Row[] {
  const uid = me(); const oppOk = (id: string) => { const o = T('opportunities').find((x) => x.id === id); return !!o && canViewOpp(o) }
  const buyerOf = (oppId: string) => orgsWith('opportunity.view').includes(T('opportunities').find((x) => x.id === oppId)?.buyer_org_id)
  switch (table) {
    case 'organizations': return rows.filter((o) => isSuper() || myMemberships().some((m) => m.organization_id === o.id))
    case 'organization_members': return rows.filter((m) => isSuper() || m.user_id === uid || myMemberships().some((x) => x.organization_id === m.organization_id))
    case 'profiles': return rows.filter((p) => p.id === uid || isSuper() || T('organization_members').some((a) => a.user_id === p.id && myMemberships().some((b) => b.organization_id === a.organization_id)))
    case 'services': { const ids = new Set(directory().map((d) => d.id)); return rows.filter((s) => ids.has(s.organization_id)) }
    case 'documents': return rows.filter(canViewDoc)
    case 'document_versions': case 'document_reviews': return rows.filter((r) => { const d = T('documents').find((x) => x.id === r.document_id); return !!d && canViewDoc(d) })
    case 'opportunities': return rows.filter(canViewOpp)
    case 'opportunity_items': case 'evaluation_criteria': case 'opportunity_notices': return rows.filter((r) => oppOk(r.opportunity_id))
    case 'deadline_extensions': return rows.filter((e) => buyerOf(e.opportunity_id) || (oppOk(e.opportunity_id) && (e.supplier_org_id == null || myMemberships().some((m) => m.organization_id === e.supplier_org_id))))
    case 'supplier_invitations': case 'clarifications': return rows.filter((r) => orgsWith('opportunity.view').includes(r.supplier_org_id) || buyerOf(r.opportunity_id))
    case 'proposals': return rows.filter(canViewProposal)
    case 'proposal_items': case 'proposal_versions': return rows.filter((r) => { const p = T('proposals').find((x) => x.id === r.proposal_id); return !!p && canViewProposal(p) })
    case 'evaluations': return rows.filter((e) => { const p = T('proposals').find((x) => x.id === e.proposal_id); return !!p && buyerOf(p.opportunity_id) && canViewProposal(p) })
    case 'commercial_decisions': return rows.filter((d) => buyerOf(d.opportunity_id))
    case 'attachments': return rows.filter((a) => myMemberships().some((m) => m.organization_id === a.organization_id) || (a.entity_type === 'opportunity' && oppOk(a.entity_id)))
    case 'inspection_maps': return rows.filter((m) => orgsWith('inspection.view').includes(m.organization_id))
    case 'inspection_map_lines': return rows.filter((l) => { const m = T('inspection_maps').find((x) => x.id === l.map_id); return !!m && orgsWith('inspection.view').includes(m.organization_id) })
    case 'hold_scans': case 'scan_validations': return rows.filter((r) => orgsWith('scan.view').includes(r.organization_id))
    case 'notifications': case 'notification_preferences': return rows.filter((n) => n.user_id === uid)
    case 'audit_logs': return rows.filter((a) => isSuper() || (a.organization_id && orgsWith('audit.view').includes(a.organization_id)))
    default: return rows
  }
}

/* -------------------------------------------------------------- RPC */
const myMemberships = () => T('organization_members').filter((m) => m.user_id === me() && m.is_active)
const permsIn = (org: string) => [...new Set(myMemberships().filter((m) => m.organization_id === org).flatMap((m) => ROLE_PERMISSIONS[m.role] ?? []))]
const isSuper = () => !!store.users.find((u) => u.id === me())?.is_superadmin
const need = (org: string, p: string) => { if (!permsIn(org).includes(p)) fail('PERMISSION_DENIED') }
const needSuper = () => { if (!isSuper()) fail('PERMISSION_DENIED') }
const orgRow = (id: string) => T('organizations').find((o) => o.id === id) ?? fail('NOT_FOUND')
const audit = (org: string | null, action: string, type: string, id: string, details: Row = {}) => T('audit_logs').unshift({ id: T('audit_logs').length + 1, actor_id: me(), organization_id: org, action, entity_type: type, entity_id: id, details, created_at: nowIso() })
function notify(user: string, org: string | null, type: string, title: string, body: string | null, et: string | null, eid: string | null) {
  T('notifications').unshift({ id: newId('ntf'), user_id: user, organization_id: org, type, title, body, entity_type: et, entity_id: eid, read_at: null, created_at: nowIso() })
}
const notifyOrg = (org: string, perm: string, type: string, title: string, body: string | null, et: string, eid: string) =>
  [...new Set(T('organization_members').filter((m) => m.organization_id === org && m.is_active && (ROLE_PERMISSIONS[m.role] ?? []).includes(perm)).map((m) => m.user_id))].forEach((u) => notify(u, org, type, title, body, et, eid))
const notifySupers = (type: string, title: string, body: string, et: string, eid: string) => store.users.filter((u) => u.is_superadmin).forEach((u) => notify(u.id, null, type, title, body, et, eid))

function requiredFields(): string[] { return (T('platform_settings').find((s) => s.key === 'profile_required_fields')?.value as string[]) ?? [] }
const oppFinalDeadline = (oppId: string) => finalDeadline(T('opportunities').find((o) => o.id === oppId) as any, T('deadline_extensions').filter((e) => e.opportunity_id === oppId) as any)
const effDeadline = (oppId: string, sup: string) => finalDeadline(T('opportunities').find((o) => o.id === oppId) as any, T('deadline_extensions').filter((e) => e.opportunity_id === oppId && (e.supplier_org_id == null || e.supplier_org_id === sup)) as any)

const rpcs: Record<string, (a: any) => any> = {
  my_context() {
    const u = store.users.find((x) => x.id === me()) ?? fail('NOT_AUTHENTICATED')
    const orgs = [...new Set(myMemberships().map((m) => m.organization_id))]
    return {
      profile: { id: u.id, full_name: u.full_name, phone: null, job_title: null, is_active: u.is_active }, is_superadmin: u.is_superadmin,
      memberships: orgs.map((id) => { const o = orgRow(id); return { organization_id: id, organization: { id, legal_name: o.legal_name, trade_name: o.trade_name, org_type: o.org_type, profile_status: o.profile_status, verification_status: o.verification_status, nif: o.nif }, roles: myMemberships().filter((m) => m.organization_id === id).map((m) => m.role), permissions: permsIn(id) } }),
      platform_permissions: u.is_superadmin ? ROLE_PERMISSIONS.superadmin : [],
    }
  },
  create_organization(a) {
    if (T('organizations').some((o) => o.nif === a.p_nif)) fail('NIF_ALREADY_REGISTERED')
    if (!/^[0-9]{10}$|^[0-9]{9}[A-Z]{2}[0-9]{3}$/.test(a.p_nif)) fail('INVALID_NIF')
    const id = newId('org')
    T('organizations').push({ id, legal_name: a.p_legal_name, trade_name: a.p_trade_name, nif: a.p_nif, org_type: a.p_org_type, sector: a.p_sector, province: a.p_province, municipality: a.p_municipality, email: a.p_email, phone: a.p_phone, address: null, website: null, contact_person: null, description: null, certifications_declared: [], profile_status: 'draft', verification_status: 'not_verified', verification_scope: null, verified_at: null, visibility: 'private', public_fields: [], is_active: true, profile_updated_at: nowIso(), created_at: nowIso() })
    const add = (role: string) => T('organization_members').push({ id: newId('mem'), organization_id: id, user_id: me(), role, is_active: true, created_at: nowIso() })
    add('org_admin'); if (a.p_org_type !== 'buyer') add('supplier'); if (a.p_org_type !== 'supplier') add('buyer')
    return id
  },
  submit_profile(a) {
    need(a.p_org, 'org.edit'); const o = orgRow(a.p_org)
    if (!['draft', 'incomplete', 'corrections_pending'].includes(o.profile_status)) fail('INVALID_STATE_TRANSITION')
    const miss = missingProfileFields(o as any, T('services').filter((s) => s.organization_id === o.id).length, requiredFields())
    if (miss.length) fail(`PROFILE_INCOMPLETE: ${miss.join(',')}`)
    Object.assign(o, { profile_status: 'submitted', submitted_at: nowIso(), profile_review_reason: null })
    notifySupers('profile_submitted', 'Perfil submetido para análise', `${o.legal_name} submeteu o perfil empresarial.`, 'organization', o.id)
  },
  review_profile(a) {
    needSuper(); const o = orgRow(a.p_org)
    if (['corrections_pending', 'rejected', 'suspended'].includes(a.p_result) && (a.p_reason ?? '').trim().length < 5) fail('REASON_REQUIRED')
    if (a.p_result === 'approved') { const miss = missingProfileFields(o as any, T('services').filter((s) => s.organization_id === o.id).length, requiredFields()); if (miss.length) fail(`PROFILE_INCOMPLETE: ${miss.join(',')}`) }
    Object.assign(o, { profile_status: a.p_result, profile_review_reason: a.p_reason ?? null })
    notifyOrg(o.id, 'org.edit', 'profile_' + a.p_result, 'Estado do perfil: ' + a.p_result, a.p_reason ?? null, 'organization', o.id)
    audit(o.id, 'organizations.update', 'organizations', o.id, { estado: { para: a.p_result } })
  },
  set_verification(a) {
    needSuper(); const o = orgRow(a.p_org)
    if (a.p_status === 'verified') {
      if ((a.p_scope ?? '').trim().length < 5) fail('VERIFICATION_SCOPE_REQUIRED'); if (o.profile_status !== 'approved') fail('PROFILE_NOT_APPROVED')
      if (!T('documents').some((d) => d.organization_id === o.id && d.status === 'approved')) fail('NO_APPROVED_DOCUMENTS')
      Object.assign(o, { verification_status: 'verified', verification_scope: a.p_scope.trim(), verified_at: nowIso() })
    } else Object.assign(o, { verification_status: a.p_status, verification_scope: null, verified_at: null })
    audit(o.id, 'organization.verification', 'organization', o.id, { estado: a.p_status, ambito: a.p_scope })
  },
  admin_set_org_active(a) { needSuper(); orgRow(a.p_org).is_active = a.p_active },
  list_org_members(a) {
    const manage = permsIn(a.p_org).includes('org.members.manage') || isSuper()
    return T('organization_members').filter((m) => m.organization_id === a.p_org).map((m) => { const u = store.users.find((x) => x.id === m.user_id); return { member_id: m.id, user_id: m.user_id, full_name: u?.full_name ?? '—', email: manage ? u?.email : null, role: m.role, is_active: m.is_active, created_at: m.created_at } })
  },
  add_member(a) {
    need(a.p_org, 'org.members.manage'); const u = store.users.find((x) => x.email.toLowerCase() === String(a.p_email).trim().toLowerCase()) ?? fail('USER_NOT_FOUND')
    if (u.id === me()) fail('CANNOT_CHANGE_OWN_ROLES')
    const ex = T('organization_members').find((m) => m.organization_id === a.p_org && m.user_id === u.id && m.role === a.p_role)
    if (ex) ex.is_active = true; else T('organization_members').push({ id: newId('mem'), organization_id: a.p_org, user_id: u.id, role: a.p_role, is_active: true, created_at: nowIso() })
  },
  set_member_active(a) {
    const m = T('organization_members').find((x) => x.id === a.p_member) ?? fail('NOT_FOUND'); need(m.organization_id, 'org.members.manage')
    if (m.user_id === me()) fail('CANNOT_CHANGE_OWN_ROLES')
    if (!a.p_active && m.role === 'org_admin' && T('organization_members').filter((x) => x.organization_id === m.organization_id && x.role === 'org_admin' && x.is_active && x.id !== m.id).length === 0) fail('LAST_ADMIN')
    m.is_active = a.p_active
  },
  admin_list_users() { needSuper(); return store.users.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, is_superadmin: u.is_superadmin, is_active: u.is_active, organizations: new Set(T('organization_members').filter((m) => m.user_id === u.id && m.is_active).map((m) => m.organization_id)).size, created_at: nowIso() })) },
  admin_set_user_active(a) { needSuper(); if (a.p_user === me()) fail('CANNOT_CHANGE_OWN_ROLES'); const u = store.users.find((x) => x.id === a.p_user); if (u) u.is_active = a.p_active },
  upload_document(a) {
    need(a.p_org, 'document.upload'); const t = T('document_types').find((x) => x.id === a.p_type && x.is_active) ?? fail('INVALID_DOCUMENT_TYPE')
    if (!t.allowed_mime.includes(a.p_mime)) fail('INVALID_FILE_TYPE'); if (a.p_file_size > t.max_size_mb * 1048576) fail('FILE_TOO_LARGE')
    if (t.requires_expiry && !a.p_valid) fail('EXPIRY_REQUIRED'); if (a.p_valid && a.p_issue && a.p_valid < a.p_issue) fail('INVALID_DATES')
    let doc = a.p_document_id ? T('documents').find((d) => d.id === a.p_document_id && d.organization_id === a.p_org) : null
    if (a.p_document_id && !doc) fail('NOT_FOUND'); if (doc?.status === 'under_review') fail('DOCUMENT_UNDER_REVIEW')
    if (doc) { T('document_versions').filter((v) => v.document_id === doc!.id).forEach((v) => (v.status = 'superseded')); Object.assign(doc, { current_version: doc.current_version + 1, title: a.p_title, reference_number: a.p_reference, issue_date: a.p_issue, valid_until: a.p_valid, status: 'submitted', submitted_at: nowIso(), reviewed_by: null, reviewed_at: null, review_reason: null, file_name: a.p_file_name, file_size: a.p_file_size, mime_type: a.p_mime }) }
    else { doc = { id: newId('doc'), organization_id: a.p_org, document_type_id: a.p_type, title: a.p_title, current_version: 1, reference_number: a.p_reference, issue_date: a.p_issue, valid_until: a.p_valid, status: 'submitted', submitted_at: nowIso(), reviewed_by: null, reviewed_at: null, review_reason: null, file_name: a.p_file_name, file_size: a.p_file_size, mime_type: a.p_mime, created_at: nowIso(), updated_at: nowIso() }; T('documents').push(doc) }
    T('document_versions').push({ id: newId('ver'), document_id: doc.id, version: doc!.current_version, storage_path: a.p_storage_path, file_name: a.p_file_name, file_size: a.p_file_size, status: 'submitted', valid_until: a.p_valid, submitted_at: nowIso() })
    notifySupers('document_submitted', 'Documento submetido para análise', a.p_title, 'document', doc.id)
    return doc.id
  },
  start_document_review(a) { needSuper(); const d = T('documents').find((x) => x.id === a.p_doc); if (!d || d.status !== 'submitted') fail('INVALID_STATE_TRANSITION'); d.status = 'under_review' },
  review_document(a) {
    needSuper(); const d = T('documents').find((x) => x.id === a.p_doc) ?? fail('NOT_FOUND')
    if (!['submitted', 'under_review'].includes(d.status)) fail('INVALID_STATE_TRANSITION'); if (a.p_result !== 'approved' && (a.p_reason ?? '').trim().length < 3) fail('REASON_REQUIRED')
    const st = a.p_result === 'approved' ? 'approved' : a.p_result === 'rejected' ? 'rejected' : 'correction_pending'
    const v = T('document_versions').find((x) => x.document_id === d.id && x.version === d.current_version)
    T('document_reviews').push({ id: newId('rev'), document_id: d.id, version_id: v?.id, reviewer_id: me(), result: a.p_result, reason: a.p_reason ?? null, reviewed_at: nowIso() })
    if (v) v.status = st
    Object.assign(d, { status: st, reviewed_by: me(), reviewed_at: nowIso(), review_reason: a.p_reason ?? null })
    notifyOrg(d.organization_id, 'document.upload', 'document_' + st, `Documento ${st === 'approved' ? 'aprovado' : st === 'rejected' ? 'rejeitado' : 'com correcção pedida'}: ${d.title}`, a.p_reason ?? null, 'document', d.id)
  },
  request_document_access(a) { const d = T('documents').find((x) => x.id === a.p_doc) ?? fail('NOT_FOUND'); return T('document_versions').find((v) => v.document_id === d.id && v.version === d.current_version)?.storage_path },
  publish_opportunity(a) {
    const o = T('opportunities').find((x) => x.id === a.p_opp) ?? fail('NOT_FOUND'); need(o.buyer_org_id, 'opportunity.manage')
    if (o.status !== 'draft') fail('INVALID_STATE_TRANSITION'); const its = T('opportunity_items').filter((i) => i.opportunity_id === o.id); if (!its.length) fail('ITEMS_REQUIRED')
    if (new Date(o.deadline).getTime() <= Date.now()) fail('DEADLINE_IN_PAST')
    const w = T('evaluation_criteria').filter((c) => c.opportunity_id === o.id).reduce((s, c) => s + Number(c.weight), 0); if (w !== 0 && w !== 100) fail('CRITERIA_WEIGHTS_INVALID')
    const inv: string[] = a.p_invitees ?? []; if (o.visibility === 'invited_only' && inv.length === 0) fail('INVITEES_REQUIRED')
    inv.forEach((id) => { const s = orgRow(id); if (!['supplier', 'both'].includes(s.org_type) || s.profile_status !== 'approved' || !s.is_active) fail('SUPPLIER_NOT_ELIGIBLE'); T('supplier_invitations').push({ id: newId('inv'), opportunity_id: o.id, supplier_org_id: id, invited_by: me(), status: 'sent', invited_at: nowIso(), viewed_at: null, responded_at: null }); notifyOrg(id, 'opportunity.view', 'invitation', `Convite para pedido de cotação ${o.number}`, o.title, 'opportunity', o.id) })
    Object.assign(o, { published_at: nowIso(), status: a.p_open === false ? (inv.length ? 'invites_sent' : 'published') : 'open' }); audit(o.buyer_org_id, 'opportunities.publish', 'opportunity', o.id, { convidados: inv.length })
  },
  invite_suppliers(a) {
    const o = T('opportunities').find((x) => x.id === a.p_opp) ?? fail('NOT_FOUND'); need(o.buyer_org_id, 'opportunity.manage'); let n = 0
    ;(a.p_invitees ?? []).forEach((id: string) => { const s = orgRow(id); if (!['supplier', 'both'].includes(s.org_type) || s.profile_status !== 'approved') fail('SUPPLIER_NOT_ELIGIBLE'); if (T('supplier_invitations').some((i) => i.opportunity_id === o.id && i.supplier_org_id === id)) return; n++; T('supplier_invitations').push({ id: newId('inv'), opportunity_id: o.id, supplier_org_id: id, invited_by: me(), status: 'sent', invited_at: nowIso(), viewed_at: null, responded_at: null }); notifyOrg(id, 'opportunity.view', 'invitation', `Convite para pedido ${o.number}`, o.title, 'opportunity', o.id) })
    return n
  },
  set_opportunity_status(a) {
    const o = T('opportunities').find((x) => x.id === a.p_opp) ?? fail('NOT_FOUND'); need(o.buyer_org_id, 'opportunity.manage')
    if (a.p_to === 'awarded' || !allowedTransitions(o.status).includes(a.p_to)) fail('INVALID_STATE_TRANSITION')
    if (a.p_to === 'cancelled' && (a.p_reason ?? '').trim().length < 5) fail('REASON_REQUIRED')
    if (a.p_to === 'under_evaluation' && oppFinalDeadline(o.id).getTime() > Date.now() && (a.p_reason ?? '').trim().length < 5) fail('DEADLINE_NOT_REACHED')
    o.status = a.p_to; if (['closed', 'cancelled'].includes(a.p_to)) o.closed_at = nowIso()
    if (a.p_to === 'under_evaluation') T('proposals').filter((p) => p.opportunity_id === o.id && p.status === 'submitted').forEach((p) => (p.status = 'in_evaluation'))
    audit(o.buyer_org_id, 'opportunities.status', 'opportunity', o.id, { para: a.p_to, motivo: a.p_reason })
  },
  extend_deadline(a) {
    const o = T('opportunities').find((x) => x.id === a.p_opp) ?? fail('NOT_FOUND'); need(o.buyer_org_id, 'opportunity.manage')
    if ((a.p_reason ?? '').trim().length < 5) fail('REASON_REQUIRED'); const prev = a.p_supplier ? effDeadline(o.id, a.p_supplier) : oppFinalDeadline(o.id)
    if (new Date(a.p_new) <= prev) fail('DEADLINE_MUST_BE_LATER')
    T('deadline_extensions').push({ id: newId('ext'), opportunity_id: o.id, supplier_org_id: a.p_supplier ?? null, previous_deadline: prev.toISOString(), new_deadline: new Date(a.p_new).toISOString(), reason: a.p_reason, created_at: nowIso() })
    if (['closed', 'under_evaluation'].includes(o.status) && new Date(a.p_new).getTime() > Date.now()) { o.status = 'open'; o.closed_at = null; T('proposals').filter((p) => p.opportunity_id === o.id && p.status === 'in_evaluation').forEach((p) => (p.status = 'submitted')) }
    T('supplier_invitations').filter((i) => i.opportunity_id === o.id).forEach((i) => notifyOrg(i.supplier_org_id, 'opportunity.view', 'deadline_extended', `Prazo prorrogado: ${o.number}`, a.p_reason, 'opportunity', o.id))
  },
  mark_invitation_viewed(a) { const i = T('supplier_invitations').find((x) => x.opportunity_id === a.p_opp && x.supplier_org_id === a.p_supplier && x.status === 'sent'); if (i) Object.assign(i, { status: 'viewed', viewed_at: nowIso() }) },
  save_proposal(a) {
    need(a.p_supplier_org, 'proposal.submit'); const o = T('opportunities').find((x) => x.id === a.p_opp) ?? fail('NOT_FOUND')
    if (o.visibility === 'invited_only' && !T('supplier_invitations').some((i) => i.opportunity_id === o.id && i.supplier_org_id === a.p_supplier_org)) fail('NOT_INVITED')
    if (!['open', 'clarification'].includes(o.status)) fail('OPPORTUNITY_NOT_OPEN'); if (Date.now() > effDeadline(o.id, a.p_supplier_org).getTime()) fail('DEADLINE_PASSED')
    const pl = a.p_payload ?? {}; if (pl.currency && pl.currency !== o.currency) fail('CURRENCY_MISMATCH')
    let p = T('proposals').find((x) => x.opportunity_id === o.id && x.supplier_org_id === a.p_supplier_org)
    if (p && ['selected', 'rejected'].includes(p.status)) fail('INVALID_STATE_TRANSITION'); if (p && ['submitted', 'in_evaluation'].includes(p.status) && !a.p_submit) fail('PROPOSAL_ALREADY_SUBMITTED')
    if (a.p_submit) {
      if (!pl.validity_until || pl.validity_until < new Date().toISOString().slice(0, 10)) fail('VALIDITY_REQUIRED')
      for (const t of o.required_document_type_ids ?? []) if (!T('documents').some((d) => d.organization_id === a.p_supplier_org && d.document_type_id === t && d.status === 'approved' && (!d.valid_until || d.valid_until >= new Date().toISOString().slice(0, 10)))) fail('MISSING_REQUIRED_DOCUMENTS')
    }
    if (!p) { p = { id: newId('prp'), number: `PRP-2026-${String(++store.seq.prop).padStart(5, '0')}`, opportunity_id: o.id, supplier_org_id: a.p_supplier_org, current_version: 0, status: 'draft', submitted_at: null, first_submitted_at: null, receipt_code: null, currency: o.currency, created_at: nowIso() }; T('proposals').push(p) }
    store.tables.proposal_items = T('proposal_items').filter((i) => i.proposal_id !== p!.id)
    let sub = 0, disc = 0, tax = 0, tot = 0
    for (const it of pl.items ?? []) {
      const oi = T('opportunity_items').find((x) => x.id === it.opportunity_item_id && x.opportunity_id === o.id) ?? fail('INVALID_ITEM')
      if (it.unit_price < 0 || it.discount_pct < 0 || it.discount_pct > 100 || it.tax_pct < 0 || it.tax_pct > 100) fail('INVALID_AMOUNTS')
      const l = calcLine({ quantity: oi.quantity, unitPrice: it.unit_price, discountPct: it.discount_pct, taxPct: it.tax_pct })
      T('proposal_items').push({ id: newId('pit'), proposal_id: p.id, opportunity_item_id: oi.id, description: oi.description, quantity: oi.quantity, unit: oi.unit, unit_price: it.unit_price, discount_pct: it.discount_pct ?? 0, tax_pct: it.tax_pct ?? 0, line_gross: l.gross, line_discount: l.discount, line_subtotal: l.subtotal, line_tax: l.tax, line_total: l.total })
      sub += l.gross; disc += l.discount; tax += l.tax; tot += l.total
    }
    if (a.p_submit && T('proposal_items').filter((i) => i.proposal_id === p!.id).length !== T('opportunity_items').filter((i) => i.opportunity_id === o.id).length) fail('ALL_ITEMS_REQUIRED')
    Object.assign(p, { subtotal: sub, discount_total: disc, tax_total: tax, total: Math.round(tot * 100) / 100, validity_until: pl.validity_until ?? null, delivery_days: pl.delivery_days ?? null, commercial_terms: pl.commercial_terms ?? null, notes: pl.notes ?? null })
    if (a.p_submit) {
      p.current_version++; Object.assign(p, { status: 'submitted', submitted_at: nowIso(), first_submitted_at: p.first_submitted_at ?? nowIso(), receipt_code: `REC-${p.number}-V${p.current_version}` })
      T('proposal_versions').push({ id: newId('pvr'), proposal_id: p.id, version: p.current_version, total: p.total, currency: p.currency, submitted_at: nowIso(), snapshot: {} })
      const inv = T('supplier_invitations').find((i) => i.opportunity_id === o.id && i.supplier_org_id === a.p_supplier_org); if (inv) Object.assign(inv, { status: 'responded', responded_at: inv.responded_at ?? nowIso() })
      notifyOrg(o.buyer_org_id, 'proposal.view', 'proposal_received', `Proposta recebida: ${p.number}`, `Pedido ${o.number}.`, 'proposal', p.id)
      notifyOrg(a.p_supplier_org, 'proposal.view', 'proposal_receipt', `Recepção confirmada: ${p.number}`, `Versão ${p.current_version} registada.`, 'proposal', p.id)
    }
    return p.id
  },
  withdraw_proposal(a) { const p = T('proposals').find((x) => x.id === a.p_proposal) ?? fail('NOT_FOUND'); need(p.supplier_org_id, 'proposal.submit'); if (p.status !== 'submitted') fail('INVALID_STATE_TRANSITION'); if (Date.now() > effDeadline(p.opportunity_id, p.supplier_org_id).getTime()) fail('DEADLINE_PASSED'); p.status = 'withdrawn' },
  ask_clarification(a) { need(a.p_supplier_org, 'proposal.submit'); const id = newId('clr'); T('clarifications').push({ id, opportunity_id: a.p_opp, supplier_org_id: a.p_supplier_org, question: a.p_question, asked_at: nowIso(), answer: null, answered_at: null, published_as_notice: false }); return id },
  answer_clarification(a) {
    const c = T('clarifications').find((x) => x.id === a.p_id) ?? fail('NOT_FOUND'); const o = T('opportunities').find((x) => x.id === c.opportunity_id)!; need(o.buyer_org_id, 'opportunity.manage')
    if ((a.p_answer ?? '').trim().length < 3) fail('REASON_REQUIRED'); Object.assign(c, { answer: a.p_answer, answered_at: nowIso(), published_as_notice: !!a.p_publish })
    if (a.p_publish) T('opportunity_notices').push({ id: newId('ntc'), opportunity_id: o.id, title: 'Esclarecimento', body: `Pergunta: ${c.question}\nResposta: ${a.p_answer}`, created_at: nowIso() })
  },
  record_decision(a) {
    const o = T('opportunities').find((x) => x.id === a.p_opp) ?? fail('NOT_FOUND'); need(o.buyer_org_id, 'opportunity.decide')
    if (!['under_evaluation', 'closed'].includes(o.status)) fail('INVALID_STATE_TRANSITION'); if (T('commercial_decisions').some((d) => d.opportunity_id === o.id)) fail('DECISION_ALREADY_RECORDED'); if ((a.p_rationale ?? '').trim().length < 10) fail('RATIONALE_REQUIRED')
    let amount: number | null = null
    if (a.p_result === 'awarded') { const p = T('proposals').find((x) => x.id === a.p_proposal && x.opportunity_id === o.id && ['submitted', 'in_evaluation'].includes(x.status)) ?? fail('INVALID_PROPOSAL'); amount = a.p_amount ?? p.total }
    const id = newId('dec'); T('commercial_decisions').push({ id, opportunity_id: o.id, result: a.p_result, proposal_id: a.p_result === 'awarded' ? a.p_proposal : null, approved_amount: amount, currency: a.p_result === 'awarded' ? o.currency : null, rationale: a.p_rationale, decided_by: me(), decided_at: nowIso() })
    T('proposals').filter((p) => p.opportunity_id === o.id && ['submitted', 'in_evaluation'].includes(p.status)).forEach((p) => { const win = a.p_result === 'awarded' && p.id === a.p_proposal; p.status = win ? 'selected' : 'rejected'; notifyOrg(p.supplier_org_id, 'proposal.view', 'decision', win ? `Proposta seleccionada: ${o.number}` : `Proposta não seleccionada: ${o.number}`, win ? 'Esta decisão não constitui contrato.' : null, 'proposal', p.id) })
    o.status = a.p_result === 'awarded' ? 'awarded' : 'closed'; o.closed_at ??= nowIso(); return id
  },
  add_attachment(a) { const id = newId('att'); T('attachments').push({ id, organization_id: a.p_org, entity_type: a.p_entity_type, entity_id: a.p_entity_id, storage_path: a.p_path, file_name: a.p_name, file_size: a.p_size, mime_type: a.p_mime, created_at: nowIso() }); return id },
  submit_inspection_map(a) {
    const m = T('inspection_maps').find((x) => x.id === a.p_map) ?? fail('NOT_FOUND'); need(m.organization_id, 'inspection.create')
    if (m.created_by !== me() && m.inspector_id !== me()) fail('PERMISSION_DENIED')
    if (!['draft', 'returned'].includes(m.status)) fail('INVALID_STATE_TRANSITION'); if (!T('inspection_map_lines').some((l) => l.map_id === m.id)) fail('LINES_REQUIRED')
    Object.assign(m, { status: 'submitted', submitted_at: nowIso(), reviewed_by: null, reviewed_at: null, review_note: null, inspector_id: m.inspector_id ?? me() })
    notifyOrg(m.organization_id, 'inspection.review', 'inspection_submitted', `Mapa de inspecção submetido: ${m.number}`, m.title, 'inspection', m.id)
    audit(m.organization_id, 'inspection_maps.submit', 'inspection_maps', m.id, { numero: m.number })
  },
  review_inspection_map(a) {
    const m = T('inspection_maps').find((x) => x.id === a.p_map) ?? fail('NOT_FOUND'); need(m.organization_id, 'inspection.review')
    if (!['approved', 'returned'].includes(a.p_result) || m.status !== 'submitted') fail('INVALID_STATE_TRANSITION')
    if (m.created_by === me() || m.inspector_id === me()) fail('CANNOT_REVIEW_OWN_MAP')
    if (a.p_result === 'returned' && (a.p_note ?? '').trim().length < 5) fail('REASON_REQUIRED')
    Object.assign(m, { status: a.p_result, reviewed_by: me(), reviewed_at: nowIso(), review_note: a.p_note ?? null })
    notify(m.inspector_id ?? m.created_by, m.organization_id, 'inspection_' + a.p_result, `${a.p_result === 'approved' ? 'Mapa aprovado' : 'Mapa devolvido'}: ${m.number}`, a.p_note ?? null, 'inspection', m.id)
    audit(m.organization_id, 'inspection_maps.review', 'inspection_maps', m.id, { resultado: a.p_result })
  },
  generate_alerts() { return { novas_notificacoes: 0 } },
  admin_opportunity_facts() { needSuper(); return T('opportunities').map((o) => ({ id: o.id, buyer_org_id: o.buyer_org_id, category_id: o.category_id, status: o.status, currency: o.currency, visibility: o.visibility, deadline: o.deadline, final_deadline: oppFinalDeadline(o.id).toISOString(), published_at: o.published_at, duplicate_of: o.duplicate_of, created_at: o.created_at })) },
  admin_proposal_facts() { needSuper(); return T('proposals').map((p) => ({ id: p.id, opportunity_id: p.opportunity_id, supplier_org_id: p.supplier_org_id, status: p.status, submitted_at: p.submitted_at, first_submitted_at: p.first_submitted_at, validity_until: p.validity_until, currency: p.currency })) },
  admin_decision_facts() { needSuper(); return T('commercial_decisions').map((d) => ({ opportunity_id: d.opportunity_id, result: d.result, decided_at: d.decided_at })) },
}

/* ------------------------------------------------------------ Cliente */
export function createDemoClient() {
  const saved = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null
  if (saved && store.users.some((u) => u.id === saved)) store.currentUserId = saved
  const setUser = (id: string | null) => { store.currentUserId = id; try { id ? sessionStorage.setItem(SESSION_KEY, id) : sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ } }
  return {
    from: (t: string) => new Query(t),
    rpc: (name: string, args: any = {}) => Promise.resolve().then(() => {
      try { const h = rpcs[name]; if (!h) return { data: null, error: { message: 'NOT_FOUND' } }; return { data: h(args) ?? null, error: null } }
      catch (e) { return { data: null, error: { message: (e as Error).message } } }
    }),
    auth: {
      getSession: async () => ({ data: { session: session() }, error: null }),
      onAuthStateChange: (cb: (e: string, s: any) => void) => { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } } },
      signInWithPassword: async ({ email }: { email: string; password: string }) => {
        const u = store.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
        if (!u || !u.is_active) return { data: { session: null }, error: { message: 'Invalid login credentials' } }
        setUser(u.id); emit('SIGNED_IN'); return { data: { session: session() }, error: null }
      },
      signUp: async ({ email, options }: any) => {
        if (store.users.some((x) => x.email === email)) return { data: null, error: { message: 'User already registered' } }
        const id = newId('usr'); store.users.push({ id, email, full_name: options?.data?.full_name ?? '', is_superadmin: false, is_active: true, group: 'Novo registo', role: 'Utilizador' })
        T('profiles').push({ id, full_name: options?.data?.full_name ?? '', phone: null, job_title: null, is_superadmin: false, is_active: true })
        setUser(id); emit('SIGNED_IN'); return { data: { session: session(), user: { id } }, error: null }
      },
      signOut: async () => { setUser(null); emit('SIGNED_OUT'); return { error: null } },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: {}, error: { message: 'DEMO_MODE' } }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: Blob) => { files.set(`${bucket}/${path}`, file); return { data: { path }, error: null } },
        remove: async (paths: string[]) => { paths.forEach((p) => files.delete(`${bucket}/${p}`)); return { data: [], error: null } },
        createSignedUrl: async (path: string) => { const f = files.get(`${bucket}/${path}`); return { data: { signedUrl: f ? URL.createObjectURL(f) : 'data:text/plain;charset=utf-8,Ficheiro%20n%C3%A3o%20encontrado.' }, error: null } },
      }),
    },
  }
}

export const DEMO_ACCOUNTS = store.users.map((u) => ({ email: u.email, name: u.full_name, superadmin: u.is_superadmin, group: u.group, role: u.role }))

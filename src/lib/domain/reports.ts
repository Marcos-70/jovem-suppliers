import { effectiveDocStatus, isDocInForce, requirementApplies, requirementSatisfied } from './documents'
import { DOC_STATUS, OPP_STATUS, PROFILE_STATUS, PROPOSAL_STATUS, VERIFICATION_STATUS } from './labels'
import type { EffectiveDocStatus } from './labels'
import { formatDate, formatDateTime, formatDuration, formatMoney, formatNumber, formatPercent } from './format'
import { finalDeadline, isValidProposal } from './opportunity'
import { DEFAULT_REQUIRED_FIELDS, missingProfileFields } from './profile'
import type {
  AuditLog, Category, CommercialDecision, DeadlineExtension, DocumentRow, DocumentType,
  Invitation, Opportunity, Organization, Proposal, QualificationRequirement,
} from './types'

/* ============================================================================
 * Dados de entrada. Tudo vem de consultas reais (já filtradas pelas permissões
 * do utilizador). Para o superadministrador, pedidos e propostas chegam como
 * "factos" sem valores nem textos comerciais — os campos opcionais ficam vazios.
 * ========================================================================== */
export type ReportOrg = Pick<Organization, 'id' | 'legal_name' | 'trade_name' | 'org_type' | 'province' | 'municipality' | 'profile_status' | 'verification_status' | 'verification_scope' | 'is_active'> & Partial<Organization>
export type ReportOpportunity = Pick<Opportunity, 'id' | 'buyer_org_id' | 'category_id' | 'status' | 'currency' | 'deadline' | 'published_at' | 'duplicate_of' | 'created_at'> & Partial<Pick<Opportunity, 'number' | 'title'>> & { final_deadline?: string }
export type ReportProposal = Pick<Proposal, 'id' | 'opportunity_id' | 'supplier_org_id' | 'status' | 'submitted_at' | 'first_submitted_at' | 'validity_until' | 'currency'> & Partial<Pick<Proposal, 'number' | 'total' | 'delivery_days'>>
export type ReportDecision = Pick<CommercialDecision, 'opportunity_id' | 'result' | 'decided_at'> & Partial<Pick<CommercialDecision, 'proposal_id' | 'approved_amount' | 'currency' | 'rationale'>>

export interface ReportData {
  now: Date
  organizations: ReportOrg[]
  services: { organization_id: string; category_id: string }[]
  documents: DocumentRow[]
  documentTypes: DocumentType[]
  requirements: QualificationRequirement[]
  categories: Category[]
  /** Uma entrada por análise documental, com a data de submissão da versão analisada. */
  reviews: { document_id: string; submitted_at: string; reviewed_at: string; result: string }[]
  opportunities: ReportOpportunity[]
  extensions: Pick<DeadlineExtension, 'opportunity_id' | 'new_deadline' | 'supplier_org_id'>[]
  proposals: ReportProposal[]
  decisions: ReportDecision[]
  invitations: Pick<Invitation, 'opportunity_id' | 'supplier_org_id' | 'status'>[]
  audit: AuditLog[]
  userNames: Record<string, string>
  requiredFields?: string[]
}

export interface ReportFilters {
  from?: string // AAAA-MM-DD
  to?: string
  status?: string
  currency?: string
  opportunityId?: string
}

/* ============================================================================
 * DEFINIÇÕES FORMAIS (usadas em painéis, relatórios e exportações)
 * ========================================================================== */
export const DEFINITIONS = {
  organizacaoElegivel:
    'Organização com tipo Fornecedor ou Fornecedor e comprador, activa, cujo perfil não está suspenso nem rejeitado.',
  perfilCompleto:
    'Perfil em que todos os campos obrigatórios configurados (platform_settings.profile_required_fields) estão preenchidos e existe pelo menos um serviço registado.',
  fornecedorActivo: 'Organização fornecedora activa com perfil aprovado.',
  documentoConforme: 'Documento aprovado e em vigor (sem validade, ou com validade não expirada).',
  requisitoAplicavel: 'Requisito activo; se tiver categoria, aplica-se só a fornecedores com serviço nessa categoria.',
  requisitoSatisfeito: 'Existe documento do tipo exigido, aprovado, em vigor e com a validade mínima restante configurada.',
  propostaValida:
    'Proposta submetida, em avaliação ou seleccionada, recebida até ao prazo efectivo do fornecedor e com validade não anterior à submissão. Retiradas e não seleccionadas não contam.',
  pedidoElegivel:
    'Pedido publicado, não cancelado, que não é duplicado (duplicate_of vazio) e cujo prazo final (incluindo extensões) já terminou. Pedidos reabertos contam uma só vez, pelo prazo final em vigor.',
  pedidoEncerrado: 'Pedido não duplicado, com estado Encerrado, Adjudicado ou Arquivado após publicação. Cancelados nunca contam.',
  adjudicacao: 'Pedido não cancelado com decisão comercial registada com resultado "Adjudicado". Não equivale a contrato.',
  taxaPerfisCompletos: 'Taxa de perfis completos = perfis completos ÷ organizações elegíveis × 100.',
  taxaConformidade: 'Taxa de conformidade documental = requisitos satisfeitos ÷ requisitos aplicáveis × 100 (soma sobre fornecedores elegíveis).',
  taxaResposta: 'Taxa de resposta = pedidos elegíveis com ≥1 proposta válida ÷ pedidos elegíveis × 100.',
  taxaConversao: 'Taxa de conversão = pedidos adjudicados ÷ pedidos elegíveis encerrados × 100.',
  tempoAnalise:
    'Tempo de análise documental = decisão − submissão da versão analisada. Cada nova versão (correcção/reabertura) reinicia a contagem; o tempo à espera de correcção do fornecedor não é contado.',
  tempoPrimeiraResposta: 'Tempo de primeira resposta = primeira submissão de proposta − publicação do pedido, por pedido com proposta.',
} as const

const ratio = (n: number, d: number): number | null => (d === 0 ? null : Math.round((n / d) * 1000) / 10)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export interface Indicator { numerator: number; denominator: number; value: number | null; definition: string }

/* ----------------------------------------------------------------- Indicadores */
export const eligibleOrganizations = (d: ReportData) =>
  d.organizations.filter(
    (o) => o.is_active && (o.org_type === 'supplier' || o.org_type === 'both') && !['suspended', 'rejected'].includes(o.profile_status),
  )

const servicesCount = (d: ReportData, orgId: string) => d.services.filter((s) => s.organization_id === orgId).length

export function profileCompleteness(d: ReportData, org: ReportOrg): string[] {
  return missingProfileFields(org, servicesCount(d, org.id), d.requiredFields ?? DEFAULT_REQUIRED_FIELDS)
}

export function profileCompletionRate(d: ReportData): Indicator {
  const el = eligibleOrganizations(d)
  const n = el.filter((o) => profileCompleteness(d, o).length === 0).length
  return { numerator: n, denominator: el.length, value: ratio(n, el.length), definition: DEFINITIONS.taxaPerfisCompletos }
}

export function activeSuppliers(d: ReportData) {
  return d.organizations.filter((o) => o.is_active && (o.org_type === 'supplier' || o.org_type === 'both') && o.profile_status === 'approved')
}

export interface RequirementCell { orgId: string; requirementId: string; satisfied: boolean }
export function requirementMatrix(d: ReportData): RequirementCell[] {
  const cells: RequirementCell[] = []
  for (const o of eligibleOrganizations(d)) {
    const cats = d.services.filter((s) => s.organization_id === o.id).map((s) => s.category_id)
    const docs = d.documents.filter((x) => x.organization_id === o.id)
    for (const r of d.requirements) {
      if (!requirementApplies(r, cats)) continue
      cells.push({ orgId: o.id, requirementId: r.id, satisfied: requirementSatisfied(r, docs, d.now) })
    }
  }
  return cells
}

export function documentComplianceRate(d: ReportData): Indicator {
  const cells = requirementMatrix(d)
  const n = cells.filter((c) => c.satisfied).length
  return { numerator: n, denominator: cells.length, value: ratio(n, cells.length), definition: DEFINITIONS.taxaConformidade }
}

const oppFinal = (d: ReportData, o: ReportOpportunity): Date =>
  o.final_deadline ? new Date(o.final_deadline) : finalDeadline(o, d.extensions.filter((e) => e.opportunity_id === o.id))

export const isValidProposalIn = (d: ReportData, p: ReportProposal): boolean => {
  const opp = d.opportunities.find((o) => o.id === p.opportunity_id)
  if (!opp) return false
  const ext: Pick<DeadlineExtension, 'new_deadline' | 'supplier_org_id'>[] = opp.final_deadline
    ? [{ new_deadline: opp.final_deadline, supplier_org_id: null }]
    : d.extensions.filter((e) => e.opportunity_id === opp.id)
  return isValidProposal({ ...p, supplier_org_id: p.supplier_org_id }, opp, ext)
}

export function eligibleOpportunities(d: ReportData): ReportOpportunity[] {
  return d.opportunities.filter(
    (o) => o.published_at && !['draft', 'cancelled'].includes(o.status) && !o.duplicate_of && oppFinal(d, o).getTime() <= d.now.getTime(),
  )
}

export function responseRate(d: ReportData): Indicator {
  const el = eligibleOpportunities(d)
  const n = el.filter((o) => d.proposals.some((p) => p.opportunity_id === o.id && isValidProposalIn(d, p))).length
  return { numerator: n, denominator: el.length, value: ratio(n, el.length), definition: DEFINITIONS.taxaResposta }
}

export const isAwarded = (d: ReportData, o: ReportOpportunity) =>
  o.status !== 'cancelled' && d.decisions.some((x) => x.opportunity_id === o.id && x.result === 'awarded')

export function conversionRate(d: ReportData): Indicator {
  const closed = eligibleOpportunities(d).filter((o) => ['closed', 'awarded', 'archived'].includes(o.status))
  const n = closed.filter((o) => isAwarded(d, o)).length
  return { numerator: n, denominator: closed.length, value: ratio(n, closed.length), definition: DEFINITIONS.taxaConversao }
}

const hours = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000

export function reviewTimes(d: ReportData): number[] {
  return d.reviews.filter((r) => r.submitted_at && r.reviewed_at).map((r) => hours(r.submitted_at, r.reviewed_at)).filter((h) => h >= 0)
}
export function firstResponseTimes(d: ReportData): { opp: ReportOpportunity; hours: number }[] {
  const out: { opp: ReportOpportunity; hours: number }[] = []
  for (const o of d.opportunities) {
    if (!o.published_at) continue
    const firsts = d.proposals.filter((p) => p.opportunity_id === o.id && p.first_submitted_at).map((p) => new Date(p.first_submitted_at as string).getTime())
    if (firsts.length) out.push({ opp: o, hours: (Math.min(...firsts) - new Date(o.published_at).getTime()) / 3_600_000 })
  }
  return out
}

export function countByEffectiveDocStatus(d: ReportData): Record<EffectiveDocStatus, number> {
  const out = { missing: 0, submitted: 0, under_review: 0, approved: 0, correction_pending: 0, rejected: 0, expiring: 0, expired: 0, superseded: 0 } as Record<EffectiveDocStatus, number>
  for (const doc of d.documents) out[effectiveDocStatus(doc, d.now)]++
  return out
}

/* ----------------------------------------------------------------- Relatórios */
export type Cell = string | number | null
export interface Column { key: string; label: string; align?: 'right' }
export interface ReportResult {
  columns: Column[]
  rows: Record<string, Cell>[]
  summary: { label: string; value: string }[]
  notes?: string[]
}
export interface ReportDef {
  id: string
  title: string
  description: string
  definition: string
  dateField: string
  filters: ('period' | 'status' | 'currency' | 'opportunity')[]
  statusOptions?: { value: string; label: string }[]
  build: (d: ReportData, f: ReportFilters) => ReportResult
}

const inPeriod = (iso: string | null | undefined, f: ReportFilters) => {
  if (!f.from && !f.to) return true
  if (!iso) return false
  const day = iso.slice(0, 10)
  return (!f.from || day >= f.from) && (!f.to || day <= f.to)
}
const orgName = (d: ReportData, id: string) => {
  const o = d.organizations.find((x) => x.id === id)
  return o ? o.trade_name || o.legal_name : '—'
}
const catName = (d: ReportData, id: string | null) => d.categories.find((c) => c.id === id)?.name ?? '—'
const yn = (b: boolean) => (b ? 'Sim' : 'Não')
const money = (v: number | null | undefined, c: string) => (v === null || v === undefined ? 'Indisponível para este perfil' : formatMoney(v, c))
const count = <T,>(xs: T[], key: (x: T) => string) => {
  const m: Record<string, number> = {}
  xs.forEach((x) => { m[key(x)] = (m[key(x)] ?? 0) + 1 })
  return m
}
const summaryFromCounts = (m: Record<string, number>, label: (k: string) => string) =>
  Object.entries(m).map(([k, v]) => ({ label: label(k), value: String(v) }))

const profileStatusOptions = Object.entries(PROFILE_STATUS).map(([value, l]) => ({ value, label: l.text }))
const oppStatusOptions = Object.entries(OPP_STATUS).map(([value, l]) => ({ value, label: l.text }))
const propStatusOptions = Object.entries(PROPOSAL_STATUS).map(([value, l]) => ({ value, label: l.text }))

export const REPORTS: ReportDef[] = [
  {
    id: 'empresas', title: 'Empresas e fornecedores',
    description: 'Organizações registadas, estado do perfil e verificação.',
    definition: DEFINITIONS.fornecedorActivo, dateField: 'data de registo', filters: ['period', 'status'], statusOptions: profileStatusOptions,
    build(d, f) {
      const rows = d.organizations
        .filter((o) => inPeriod(o.created_at, f) && (!f.status || o.profile_status === f.status))
        .map((o) => ({
          nome: o.trade_name || o.legal_name, nif: o.nif ?? '—', provincia: o.province ?? '—',
          estado: PROFILE_STATUS[o.profile_status].text, verificacao: VERIFICATION_STATUS[o.verification_status].text,
          servicos: servicesCount(d, o.id), activo: yn(o.is_active), registo: formatDate(o.created_at),
        }))
      return {
        columns: [
          { key: 'nome', label: 'Empresa' }, { key: 'nif', label: 'NIF' }, { key: 'provincia', label: 'Província' },
          { key: 'estado', label: 'Estado do perfil' }, { key: 'verificacao', label: 'Verificação' },
          { key: 'servicos', label: 'Serviços', align: 'right' }, { key: 'activo', label: 'Activa' }, { key: 'registo', label: 'Registo' },
        ],
        rows,
        summary: [
          { label: 'Organizações listadas', value: String(rows.length) },
          { label: 'Fornecedores activos (aprovados)', value: String(activeSuppliers(d).length) },
        ],
      }
    },
  },
  {
    id: 'perfis', title: 'Perfis completos e incompletos',
    description: 'Campos obrigatórios em falta por fornecedor elegível.',
    definition: DEFINITIONS.perfilCompleto, dateField: 'última actualização do perfil', filters: ['period'],
    build(d, f) {
      const el = eligibleOrganizations(d).filter((o) => inPeriod(o.profile_updated_at, f))
      const rows = el.map((o) => {
        const miss = profileCompleteness(d, o)
        return { nome: o.trade_name || o.legal_name, completo: yn(miss.length === 0), em_falta: miss.length ? miss.join(', ') : '—', actualizado: formatDate(o.profile_updated_at) }
      })
      const ind = profileCompletionRate({ ...d, organizations: el })
      return {
        columns: [{ key: 'nome', label: 'Fornecedor' }, { key: 'completo', label: 'Perfil completo' }, { key: 'em_falta', label: 'Campos em falta' }, { key: 'actualizado', label: 'Actualizado' }],
        rows,
        summary: [
          { label: 'Elegíveis', value: String(ind.denominator) }, { label: 'Completos', value: String(ind.numerator) },
          { label: 'Taxa de perfis completos', value: formatPercent(ind.value) },
        ],
        notes: [DEFINITIONS.taxaPerfisCompletos, DEFINITIONS.organizacaoElegivel],
      }
    },
  },
  {
    id: 'verificacao', title: 'Estado de verificação',
    description: 'Verificações efectivamente realizadas e respectivo âmbito.',
    definition: 'Só aparece como verificado quem foi verificado por um superadministrador, com âmbito registado.', dateField: 'data de verificação', filters: ['period'],
    build(d, f) {
      const rows = d.organizations.filter((o) => inPeriod(o.verified_at ?? o.created_at, f)).map((o) => ({
        nome: o.trade_name || o.legal_name, estado: VERIFICATION_STATUS[o.verification_status].text,
        ambito: o.verification_scope ?? '—', data: formatDate(o.verified_at ?? null),
      }))
      return {
        columns: [{ key: 'nome', label: 'Empresa' }, { key: 'estado', label: 'Estado' }, { key: 'ambito', label: 'Âmbito da verificação' }, { key: 'data', label: 'Data' }],
        rows,
        summary: summaryFromCounts(count(d.organizations, (o) => o.verification_status), (k) => VERIFICATION_STATUS[k as keyof typeof VERIFICATION_STATUS].text),
      }
    },
  },
  {
    id: 'documentos', title: 'Documentos: válidos, pendentes, a expirar e expirados',
    description: 'Estado efectivo de cada documento à data de geração.',
    definition: DEFINITIONS.documentoConforme, dateField: 'data de submissão', filters: ['period', 'status'],
    statusOptions: Object.entries(DOC_STATUS).filter(([k]) => k !== 'missing').map(([value, l]) => ({ value, label: l.text })),
    build(d, f) {
      const types = Object.fromEntries(d.documentTypes.map((t) => [t.id, t.name]))
      const docs = d.documents.filter((x) => inPeriod(x.submitted_at, f) && (!f.status || effectiveDocStatus(x, d.now) === f.status))
      const rows = docs.map((x) => ({
        organizacao: orgName(d, x.organization_id), tipo: types[x.document_type_id] ?? '—', titulo: x.title,
        estado: DOC_STATUS[effectiveDocStatus(x, d.now)].text, validade: formatDate(x.valid_until), versao: x.current_version,
      }))
      const c = countByEffectiveDocStatus({ ...d, documents: docs })
      return {
        columns: [
          { key: 'organizacao', label: 'Organização' }, { key: 'tipo', label: 'Tipo' }, { key: 'titulo', label: 'Documento' },
          { key: 'estado', label: 'Estado' }, { key: 'validade', label: 'Validade' }, { key: 'versao', label: 'Versão', align: 'right' },
        ],
        rows,
        summary: [
          { label: 'Válidos e aprovados', value: String(c.approved) },
          { label: 'Pendentes (submetidos, em análise, correcção)', value: String(c.submitted + c.under_review + c.correction_pending) },
          { label: 'Próximos da validade', value: String(c.expiring) }, { label: 'Expirados', value: String(c.expired) },
          { label: 'Rejeitados', value: String(c.rejected) },
        ],
      }
    },
  },
  {
    id: 'requisitos', title: 'Requisitos de qualificação',
    description: 'Requisitos satisfeitos e não satisfeitos por fornecedor.',
    definition: DEFINITIONS.requisitoSatisfeito, dateField: '—', filters: [],
    build(d) {
      const cells = requirementMatrix(d)
      const rows = cells.map((c) => ({
        fornecedor: orgName(d, c.orgId), requisito: d.requirements.find((r) => r.id === c.requirementId)?.name ?? '—', satisfeito: yn(c.satisfied),
      }))
      const ind = documentComplianceRate(d)
      return {
        columns: [{ key: 'fornecedor', label: 'Fornecedor' }, { key: 'requisito', label: 'Requisito' }, { key: 'satisfeito', label: 'Satisfeito' }],
        rows,
        summary: [
          { label: 'Requisitos aplicáveis', value: String(ind.denominator) }, { label: 'Satisfeitos', value: String(ind.numerator) },
          { label: 'Taxa de conformidade documental', value: formatPercent(ind.value) },
        ],
        notes: [DEFINITIONS.taxaConformidade, DEFINITIONS.requisitoAplicavel],
      }
    },
  },
  {
    id: 'pedidos', title: 'Pedidos de cotação por estado e período',
    description: 'Pedidos criados no período, por estado.',
    definition: DEFINITIONS.pedidoElegivel, dateField: 'data de criação', filters: ['period', 'status'], statusOptions: oppStatusOptions,
    build(d, f) {
      const opps = d.opportunities.filter((o) => inPeriod(o.created_at, f) && (!f.status || o.status === f.status))
      const rows = opps.map((o) => ({
        numero: o.number ?? '—', titulo: o.title ?? '—', comprador: orgName(d, o.buyer_org_id), categoria: catName(d, o.category_id),
        estado: OPP_STATUS[o.status].text, prazo: formatDateTime(oppFinal(d, o).toISOString()), propostas: d.proposals.filter((p) => p.opportunity_id === o.id && p.submitted_at).length,
      }))
      const resp = responseRate({ ...d, opportunities: opps })
      const conv = conversionRate({ ...d, opportunities: opps })
      return {
        columns: [
          { key: 'numero', label: 'Nº' }, { key: 'titulo', label: 'Título' }, { key: 'comprador', label: 'Comprador' }, { key: 'categoria', label: 'Categoria' },
          { key: 'estado', label: 'Estado' }, { key: 'prazo', label: 'Prazo final' }, { key: 'propostas', label: 'Propostas', align: 'right' },
        ],
        rows,
        summary: [
          ...summaryFromCounts(count(opps, (o) => o.status), (k) => OPP_STATUS[k as keyof typeof OPP_STATUS].text),
          { label: 'Taxa de resposta', value: formatPercent(resp.value) }, { label: 'Taxa de conversão', value: formatPercent(conv.value) },
        ],
        notes: [DEFINITIONS.taxaResposta, DEFINITIONS.taxaConversao, DEFINITIONS.pedidoElegivel, DEFINITIONS.pedidoEncerrado, DEFINITIONS.adjudicacao],
      }
    },
  },
  {
    id: 'propostas', title: 'Propostas recebidas, válidas, retiradas e rejeitadas',
    description: 'Propostas por estado. Valores propostos nunca são somados.',
    definition: DEFINITIONS.propostaValida, dateField: 'data de submissão', filters: ['period', 'status', 'currency'], statusOptions: propStatusOptions,
    build(d, f) {
      const ps = d.proposals.filter((p) => p.status !== 'draft' && inPeriod(p.submitted_at, f) && (!f.status || p.status === f.status) && (!f.currency || p.currency === f.currency))
      const rows = ps.map((p) => ({
        numero: p.number ?? '—', pedido: d.opportunities.find((o) => o.id === p.opportunity_id)?.number ?? '—', fornecedor: orgName(d, p.supplier_org_id),
        estado: PROPOSAL_STATUS[p.status].text, valida: yn(isValidProposalIn(d, p)), valor_proposto: money(p.total, p.currency), submetida: formatDateTime(p.submitted_at),
      }))
      return {
        columns: [
          { key: 'numero', label: 'Proposta' }, { key: 'pedido', label: 'Pedido' }, { key: 'fornecedor', label: 'Fornecedor' }, { key: 'estado', label: 'Estado' },
          { key: 'valida', label: 'Válida' }, { key: 'valor_proposto', label: 'Valor proposto', align: 'right' }, { key: 'submetida', label: 'Submetida' },
        ],
        rows,
        summary: [
          { label: 'Recebidas', value: String(ps.length) }, { label: 'Válidas', value: String(ps.filter((p) => isValidProposalIn(d, p)).length) },
          { label: 'Retiradas', value: String(ps.filter((p) => p.status === 'withdrawn').length) },
          { label: 'Não seleccionadas', value: String(ps.filter((p) => p.status === 'rejected').length) },
        ],
        notes: [DEFINITIONS.propostaValida, 'Valores propostos de fornecedores diferentes não são somados nem convertidos entre moedas.'],
      }
    },
  },
  {
    id: 'comparacao', title: 'Comparação de propostas por pedido',
    description: 'Preço total, prazo de entrega e diferença face à proposta mais baixa (mesma moeda).',
    definition: 'Comparação objectiva de valores; não é uma recomendação automática.', dateField: '—', filters: ['opportunity'],
    build(d, f) {
      const opp = d.opportunities.find((o) => o.id === f.opportunityId)
      if (!opp) return { columns: [], rows: [], summary: [], notes: ['Seleccione um pedido.'] }
      const ps = d.proposals.filter((p) => p.opportunity_id === opp.id && isValidProposalIn(d, p) && p.total !== undefined)
      const min = Math.min(...ps.map((p) => Number(p.total)))
      const rows = [...ps].sort((a, b) => Number(a.total) - Number(b.total)).map((p, i) => ({
        ordem: i + 1, fornecedor: orgName(d, p.supplier_org_id), total: money(p.total, p.currency),
        diferenca: min > 0 ? `+${formatNumber(((Number(p.total) - min) / min) * 100, 1)}%` : '—',
        entrega: p.delivery_days ?? null, validade: formatDate(p.validity_until),
      }))
      return {
        columns: [
          { key: 'ordem', label: 'Ordem por preço', align: 'right' }, { key: 'fornecedor', label: 'Fornecedor' }, { key: 'total', label: 'Total', align: 'right' },
          { key: 'diferenca', label: 'Diferença vs. mais baixa', align: 'right' }, { key: 'entrega', label: 'Entrega (dias)', align: 'right' }, { key: 'validade', label: 'Validade' },
        ],
        rows, summary: [{ label: 'Propostas válidas comparadas', value: String(ps.length) }, { label: 'Pedido', value: `${opp.number ?? ''} ${opp.title ?? ''}`.trim() }],
        notes: ['Só são comparadas propostas válidas, na moeda do pedido.'],
      }
    },
  },
  {
    id: 'decisoes', title: 'Decisões comerciais e fundamentos',
    description: 'Valores propostos, aprovados e contratados são conceitos distintos.',
    definition: DEFINITIONS.adjudicacao, dateField: 'data da decisão', filters: ['period', 'currency'],
    build(d, f) {
      const ds = d.decisions.filter((x) => inPeriod(x.decided_at, f) && (!f.currency || x.currency === f.currency))
      const rows = ds.map((x) => {
        const o = d.opportunities.find((y) => y.id === x.opportunity_id)
        const p = d.proposals.find((y) => y.id === x.proposal_id)
        return {
          pedido: o?.number ?? '—', resultado: x.result === 'awarded' ? 'Adjudicado' : 'Sem adjudicação',
          fornecedor: p ? orgName(d, p.supplier_org_id) : '—',
          valor_proposto: p ? money(p.total, p.currency) : '—', valor_aprovado: x.approved_amount != null && x.currency ? formatMoney(x.approved_amount, x.currency) : '—',
          valor_contratado: 'Sem dados disponíveis', fundamento: x.rationale ?? 'Indisponível para este perfil', data: formatDate(x.decided_at),
        }
      })
      return {
        columns: [
          { key: 'pedido', label: 'Pedido' }, { key: 'resultado', label: 'Resultado' }, { key: 'fornecedor', label: 'Fornecedor' },
          { key: 'valor_proposto', label: 'Valor proposto', align: 'right' }, { key: 'valor_aprovado', label: 'Valor aprovado', align: 'right' },
          { key: 'valor_contratado', label: 'Valor contratado', align: 'right' }, { key: 'fundamento', label: 'Fundamento' }, { key: 'data', label: 'Data' },
        ],
        rows, summary: [{ label: 'Decisões', value: String(ds.length) }, { label: 'Adjudicações', value: String(ds.filter((x) => x.result === 'awarded').length) }],
        notes: ['Contratos não são geridos nesta versão: o valor contratado não está disponível.'],
      }
    },
  },
  {
    id: 'tempo-analise', title: 'Tempo de análise documental',
    description: 'Da submissão da versão à decisão.', definition: DEFINITIONS.tempoAnalise, dateField: 'data da análise', filters: ['period'],
    build(d, f) {
      const rs = d.reviews.filter((r) => inPeriod(r.reviewed_at, f))
      const hs = reviewTimes({ ...d, reviews: rs })
      const rows = rs.map((r) => ({
        documento: d.documents.find((x) => x.id === r.document_id)?.title ?? '—', submetido: formatDateTime(r.submitted_at), decidido: formatDateTime(r.reviewed_at),
        resultado: r.result === 'approved' ? 'Aprovado' : r.result === 'rejected' ? 'Rejeitado' : 'Correcção pedida', duracao: formatDuration(hours(r.submitted_at, r.reviewed_at)),
      }))
      return {
        columns: [{ key: 'documento', label: 'Documento' }, { key: 'submetido', label: 'Submetido' }, { key: 'decidido', label: 'Decidido' }, { key: 'resultado', label: 'Resultado' }, { key: 'duracao', label: 'Duração', align: 'right' }],
        rows, summary: [{ label: 'Análises', value: String(hs.length) }, { label: 'Tempo médio', value: formatDuration(avg(hs)) }, { label: 'Mediana', value: formatDuration(median(hs)) }],
        notes: [DEFINITIONS.tempoAnalise],
      }
    },
  },
  {
    id: 'primeira-resposta', title: 'Tempo de primeira resposta',
    description: 'Da publicação do pedido à primeira proposta.', definition: DEFINITIONS.tempoPrimeiraResposta, dateField: 'data de publicação', filters: ['period'],
    build(d, f) {
      const fr = firstResponseTimes(d).filter((x) => inPeriod(x.opp.published_at, f))
      const hs = fr.map((x) => x.hours)
      return {
        columns: [{ key: 'pedido', label: 'Pedido' }, { key: 'publicado', label: 'Publicado' }, { key: 'duracao', label: 'Primeira resposta após', align: 'right' }],
        rows: fr.map((x) => ({ pedido: x.opp.number ?? '—', publicado: formatDateTime(x.opp.published_at), duracao: formatDuration(x.hours) })),
        summary: [{ label: 'Pedidos com resposta', value: String(hs.length) }, { label: 'Tempo médio', value: formatDuration(avg(hs)) }, { label: 'Mediana', value: formatDuration(median(hs)) }],
        notes: [DEFINITIONS.tempoPrimeiraResposta],
      }
    },
  },
  {
    id: 'actividade', title: 'Actividade dos utilizadores e auditoria',
    description: 'Registos de auditoria a que tem acesso.', definition: 'Eventos críticos registados automaticamente pelo servidor.', dateField: 'data do evento', filters: ['period'],
    build(d, f) {
      const logs = d.audit.filter((a) => inPeriod(a.created_at, f))
      return {
        columns: [{ key: 'quando', label: 'Quando' }, { key: 'utilizador', label: 'Utilizador' }, { key: 'accao', label: 'Acção' }, { key: 'entidade', label: 'Entidade' }],
        rows: logs.map((a) => ({ quando: formatDateTime(a.created_at), utilizador: a.actor_id ? d.userNames[a.actor_id] ?? 'Utilizador' : 'Sistema', accao: a.action, entidade: a.entity_type ?? '—' })),
        summary: [{ label: 'Eventos', value: String(logs.length) }, { label: 'Utilizadores distintos', value: String(new Set(logs.map((a) => a.actor_id).filter(Boolean)).size) }],
      }
    },
  },
]

export { isDocInForce }

/* ------------------------------------------------------------------ CSV */
const esc = (v: Cell) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV com BOM UTF-8 e ";" (abre correctamente no Excel em português). Inclui metadados exigidos. */
export function toCsv(def: ReportDef, res: ReportResult, f: ReportFilters, generatedAt: Date, who: string): string {
  const head = [
    ['Relatório', def.title], ['Gerado em', formatDateTime(generatedAt)], ['Gerado por', who],
    ['Período', f.from || f.to ? `${f.from ? formatDate(f.from) : '…'} a ${f.to ? formatDate(f.to) : '…'} (${def.dateField})` : 'Sem filtro de período'],
    ['Filtros', [f.status && `estado=${f.status}`, f.currency && `moeda=${f.currency}`, f.opportunityId && `pedido=${f.opportunityId}`].filter(Boolean).join(', ') || 'Nenhum'],
    ['Moeda', 'Valores com a moeda indicada em cada linha; sem conversão entre moedas'],
    ['Definição', def.definition], ['Fuso horário', 'Africa/Luanda'],
  ]
  const lines = head.map((r) => r.map(esc).join(';'))
  lines.push('', ...res.summary.map((s) => [s.label, s.value].map(esc).join(';')), '')
  lines.push(res.columns.map((c) => esc(c.label)).join(';'))
  for (const r of res.rows) lines.push(res.columns.map((c) => esc(r[c.key])).join(';'))
  return '\uFEFF' + lines.join('\r\n')
}

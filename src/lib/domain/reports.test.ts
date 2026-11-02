import { describe, expect, it } from 'vitest'
import {
  REPORTS, conversionRate, documentComplianceRate, eligibleOpportunities, firstResponseTimes, profileCompletionRate,
  responseRate, reviewTimes, toCsv, type ReportData, type ReportOpportunity, type ReportOrg, type ReportProposal,
} from './reports'
import type { DocumentRow, QualificationRequirement } from './types'

const NOW = new Date('2026-10-24T10:00:00Z')
const org = (id: string, o: Partial<ReportOrg> = {}): ReportOrg => ({
  id, legal_name: `Org ${id}`, trade_name: null, org_type: 'supplier', province: 'Luanda', municipality: 'Belas',
  profile_status: 'approved', verification_status: 'not_verified', verification_scope: null, is_active: true,
  nif: '5000000000', sector: 's', address: 'a', phone: 'p', email: 'e', contact_person: 'c', description: 'd', ...o,
})
const opp = (id: string, o: Partial<ReportOpportunity> = {}): ReportOpportunity => ({
  id, buyer_org_id: 'B', category_id: null, status: 'closed', currency: 'AOA', deadline: '2026-10-01T10:00:00Z',
  published_at: '2026-09-20T10:00:00Z', duplicate_of: null, created_at: '2026-09-19T10:00:00Z', number: `RFQ-${id}`, title: `Pedido ${id}`, ...o,
})
const prop = (id: string, opportunity_id: string, o: Partial<ReportProposal> = {}): ReportProposal => ({
  id, opportunity_id, supplier_org_id: 'S1', status: 'submitted', submitted_at: '2026-09-25T10:00:00Z',
  first_submitted_at: '2026-09-25T10:00:00Z', validity_until: '2026-12-31', currency: 'AOA', total: 1000, ...o,
})
const doc = (id: string, organization_id: string, o: Partial<DocumentRow> = {}): DocumentRow => ({
  id, organization_id, document_type_id: 'T1', title: `Doc ${id}`, current_version: 1, reference_number: null, issue_date: null,
  valid_until: null, status: 'approved', submitted_at: '2026-09-01T10:00:00Z', reviewed_by: null, reviewed_at: null, review_reason: null,
  file_name: 'f.pdf', file_size: 1, mime_type: 'application/pdf', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', ...o,
})
const req: QualificationRequirement = { id: 'R1', name: 'Registo comercial válido', description: null, document_type_id: 'T1', category_id: null, min_validity_days: 0, is_mandatory: true, is_active: true }

function base(): ReportData {
  return {
    now: NOW, organizations: [], services: [], documents: [], documentTypes: [], requirements: [req], categories: [], reviews: [],
    opportunities: [], extensions: [], proposals: [], decisions: [], invitations: [], audit: [], userNames: {},
    requiredFields: ['legal_name', 'phone', 'services'],
  }
}

describe('indicadores — totais batem com os registos de origem', () => {
  it('perfis completos só contam organizações elegíveis', () => {
    const d = base()
    d.organizations = [
      org('A'), org('B', { phone: '' }), org('C'), org('D', { profile_status: 'suspended' }), org('E', { is_active: false }), org('F', { org_type: 'buyer' }),
    ]
    d.services = [{ organization_id: 'A', category_id: 'c' }, { organization_id: 'B', category_id: 'c' }]
    const r = profileCompletionRate(d)
    expect(r.denominator).toBe(3) // A, B, C (D suspenso, E inactivo, F comprador)
    expect(r.numerator).toBe(1) // só A (B sem telefone, C sem serviços)
    expect(r.value).toBe(33.3)
  })
  it('sem elegíveis devolve nulo, não zero', () => {
    expect(profileCompletionRate(base()).value).toBeNull()
    expect(responseRate(base()).value).toBeNull()
  })
  it('conformidade documental', () => {
    const d = base()
    d.organizations = [org('A'), org('B'), org('C')]
    d.documents = [doc('1', 'A'), doc('2', 'B', { valid_until: '2026-01-01' }), doc('3', 'C', { status: 'submitted' })]
    const r = documentComplianceRate(d)
    expect(r.denominator).toBe(3)
    expect(r.numerator).toBe(1) // B expirado, C ainda não aprovado
  })
  it('elegibilidade de pedidos: duplicados, cancelados, rascunhos e prazo por terminar', () => {
    const d = base()
    d.opportunities = [
      opp('1'), opp('2', { duplicate_of: '1' }), opp('3', { status: 'cancelled' }), opp('4', { status: 'draft', published_at: null }),
      opp('5', { deadline: '2026-12-01T10:00:00Z', status: 'open' }),
    ]
    expect(eligibleOpportunities(d).map((o) => o.id)).toEqual(['1'])
  })
  it('pedido reaberto conta uma vez e usa o prazo final prorrogado', () => {
    const d = base()
    d.opportunities = [opp('1', { status: 'open' })]
    d.extensions = [{ opportunity_id: '1', new_deadline: '2026-11-15T10:00:00Z', supplier_org_id: null }]
    expect(eligibleOpportunities(d)).toHaveLength(0) // prazo prorrogado ainda não terminou
    d.extensions = [{ opportunity_id: '1', new_deadline: '2026-10-10T10:00:00Z', supplier_org_id: null }]
    expect(eligibleOpportunities(d)).toHaveLength(1)
  })
  it('taxa de resposta ignora propostas retiradas e fora do prazo', () => {
    const d = base()
    d.opportunities = [opp('1'), opp('2'), opp('3'), opp('4')]
    d.proposals = [
      prop('p1', '1'), prop('p2', '2', { status: 'withdrawn' }), prop('p3', '3', { submitted_at: '2026-10-05T10:00:00Z' }),
    ]
    const r = responseRate(d)
    expect(r.denominator).toBe(4)
    expect(r.numerator).toBe(1)
    expect(r.value).toBe(25)
  })
  it('extensão dirigida torna válida a proposta do fornecedor visado', () => {
    const d = base()
    d.opportunities = [opp('1')]
    d.proposals = [prop('p1', '1', { submitted_at: '2026-10-05T10:00:00Z', supplier_org_id: 'S1' })]
    d.extensions = [{ opportunity_id: '1', new_deadline: '2026-10-08T10:00:00Z', supplier_org_id: 'S1' }]
    expect(responseRate(d).numerator).toBe(1)
  })
  it('taxa de conversão: adjudicados ÷ encerrados elegíveis (cancelados fora)', () => {
    const d = base()
    d.opportunities = [opp('1', { status: 'awarded' }), opp('2', { status: 'closed' }), opp('3', { status: 'archived' }), opp('4', { status: 'cancelled' }), opp('5', { status: 'under_evaluation' })]
    d.decisions = [{ opportunity_id: '1', result: 'awarded', decided_at: '2026-10-10T10:00:00Z' }, { opportunity_id: '3', result: 'awarded', decided_at: '2026-10-10T10:00:00Z' }, { opportunity_id: '2', result: 'no_award', decided_at: '2026-10-10T10:00:00Z' }]
    const r = conversionRate(d)
    expect(r.denominator).toBe(3)
    expect(r.numerator).toBe(2)
    expect(r.value).toBe(66.7)
  })
  it('tempos de análise e de primeira resposta', () => {
    const d = base()
    d.reviews = [
      { document_id: '1', submitted_at: '2026-10-01T08:00:00Z', reviewed_at: '2026-10-01T20:00:00Z', result: 'approved' },
      { document_id: '2', submitted_at: '2026-10-01T08:00:00Z', reviewed_at: '2026-10-03T08:00:00Z', result: 'rejected' },
    ]
    expect(reviewTimes(d)).toEqual([12, 48])
    d.opportunities = [opp('1', { published_at: '2026-09-20T10:00:00Z' })]
    d.proposals = [prop('a', '1', { first_submitted_at: '2026-09-22T10:00:00Z' }), prop('b', '1', { first_submitted_at: '2026-09-21T10:00:00Z' })]
    expect(firstResponseTimes(d)[0].hours).toBe(24)
  })
})

describe('relatórios e exportação', () => {
  it('relatório de propostas: contagens batem com as linhas e valores não são somados', () => {
    const d = base()
    d.opportunities = [opp('1')]
    d.proposals = [prop('a', '1'), prop('b', '1', { status: 'withdrawn', supplier_org_id: 'S2' }), prop('c', '1', { status: 'draft' })]
    const def = REPORTS.find((r) => r.id === 'propostas')!
    const res = def.build(d, {})
    expect(res.rows).toHaveLength(2) // rascunho excluído
    expect(res.summary.find((s) => s.label === 'Recebidas')?.value).toBe('2')
    expect(res.summary.find((s) => s.label === 'Retiradas')?.value).toBe('1')
    expect(res.summary.some((s) => /total|soma/i.test(s.label))).toBe(false)
  })
  it('filtro de período e de moeda', () => {
    const d = base()
    d.opportunities = [opp('1')]
    d.proposals = [prop('a', '1'), prop('b', '1', { submitted_at: '2026-08-01T10:00:00Z', supplier_org_id: 'S2' }), prop('c', '1', { currency: 'USD', supplier_org_id: 'S3' })]
    const def = REPORTS.find((r) => r.id === 'propostas')!
    expect(def.build(d, { from: '2026-09-01' }).rows).toHaveLength(2)
    expect(def.build(d, { currency: 'USD' }).rows).toHaveLength(1)
  })
  it('perfil do superadministrador não vê valores comerciais', () => {
    const d = base()
    d.opportunities = [opp('1')]
    d.proposals = [prop('a', '1', { total: undefined })]
    const res = REPORTS.find((r) => r.id === 'propostas')!.build(d, {})
    expect(res.rows[0].valor_proposto).toBe('Indisponível para este perfil')
  })
  it('CSV inclui metadados, BOM, escapa aspas e usa ;', () => {
    const d = base()
    d.organizations = [org('A', { legal_name: 'Empresa "Aspas"; Lda' })]
    const def = REPORTS.find((r) => r.id === 'empresas')!
    const csv = toCsv(def, def.build(d, {}), {}, NOW, 'Maria')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Relatório;Empresas e fornecedores')
    expect(csv).toContain('Gerado por;Maria')
    expect(csv).toContain('"Empresa ""Aspas""; Lda"')
    expect(csv).toContain('Fuso horário;Africa/Luanda')
  })
  it('todas as definições estão documentadas', () => {
    for (const r of REPORTS) { expect(r.definition.length).toBeGreaterThan(10); expect(r.title).toBeTruthy() }
    expect(REPORTS.map((r) => r.id)).toContain('tempo-analise')
  })
})

import { describe, expect, it } from 'vitest'
import vectors from '../../../supabase/tests/calc_vectors.json'
import { calcLine, calcProposal } from './proposal'
import { daysUntil, formatBytes, formatDate, formatDateTime, formatMoney, formatNumber, todayLuanda } from './format'
import { effectiveDocStatus, requirementApplies, requirementSatisfied, safeFileName, validateUpload } from './documents'
import { missingProfileFields } from './profile'
import { allowedTransitions, canSubmitProposal, deadlineState, effectiveDeadline, finalDeadline } from './opportunity'
import { evaluationMatrix, weightsValid } from './evaluation'
import { isValidNif, loginSchema, passwordSchema, registerSchema } from './validators'
import { friendlyError } from './errors'
import { can, permissionSet } from './permissions'
import type { EvaluationCriterion, QualificationRequirement, UserContext } from './types'

const NOW = new Date('2026-10-24T10:00:00Z') // 11:00 em Luanda

describe('cálculo de propostas (paridade com public.calc_line)', () => {
  it.each(vectors.map((v, i) => [i + 1, v] as const))('vector %i', (_i, v) => {
    expect(calcLine({ quantity: v.quantity, unitPrice: v.unitPrice, discountPct: v.discountPct, taxPct: v.taxPct })).toEqual({
      gross: v.gross, discount: v.discount, subtotal: v.subtotal, tax: v.tax, total: v.total,
    })
  })
  it('total da proposta é a soma das linhas arredondadas', () => {
    const r = calcProposal([
      { quantity: 3, unitPrice: 1234.56, discountPct: 10, taxPct: 14 },
      { quantity: 10.5, unitPrice: 5000, taxPct: 14 },
    ])
    expect(r.total).toBe(63649.97)
    expect(r.subtotal).toBe(56203.68)
    expect(r.discountTotal).toBe(370.37)
    expect(r.taxTotal).toBe(7816.66)
    expect(r.subtotal - r.discountTotal + r.taxTotal).toBeCloseTo(r.total, 2)
  })
  it('evita erros de vírgula flutuante', () => {
    expect(calcLine({ quantity: 3, unitPrice: 0.1 }).gross).toBe(0.3)
    expect(calcProposal([]).total).toBe(0)
  })
})

describe('formatação angolana', () => {
  it('datas DD/MM/AAAA no fuso de Luanda', () => {
    expect(formatDate('2026-03-05')).toBe('05/03/2026')
    expect(formatDate('2026-10-24T23:30:00Z')).toBe('25/10/2026') // 00:30 em Luanda
    expect(formatDateTime('2026-10-24T10:00:00Z')).toBe('24/10/2026 11:00')
    expect(formatDate(null)).toBe('—')
    expect(todayLuanda(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25')
  })
  it('valores com moeda explícita', () => {
    expect(formatMoney(1250000, 'AOA')).toBe('1\u00A0250\u00A0000,00\u00A0AOA')
    expect(formatMoney('63649.97', 'USD')).toBe('63\u00A0649,97\u00A0USD')
    expect(formatNumber(-1234.5)).toBe('-1\u00A0234,50')
    expect(formatMoney(null, 'AOA')).toBe('—')
  })
  it('dias até uma data', () => {
    expect(daysUntil('2026-10-27', NOW)).toBe(3)
    expect(daysUntil('2026-10-23', NOW)).toBe(-1)
    expect(formatBytes(1536)).toBe('2 KB')
  })
})

describe('estado efectivo de documentos', () => {
  const doc = (status: 'approved' | 'submitted', valid_until: string | null) => ({ status, valid_until })
  it('expirado, próximo da validade e válido', () => {
    expect(effectiveDocStatus(doc('approved', '2026-10-23'), NOW)).toBe('expired')
    expect(effectiveDocStatus(doc('approved', '2026-10-24'), NOW)).toBe('expiring')
    expect(effectiveDocStatus(doc('approved', '2026-11-23'), NOW)).toBe('expiring') // 30 dias
    expect(effectiveDocStatus(doc('approved', '2026-11-24'), NOW)).toBe('approved')
    expect(effectiveDocStatus(doc('approved', null), NOW)).toBe('approved')
    expect(effectiveDocStatus(doc('submitted', '2020-01-01'), NOW)).toBe('submitted')
  })
  const req = (o: Partial<QualificationRequirement> = {}): QualificationRequirement => ({
    id: 'r', name: 'R', description: null, document_type_id: 't1', category_id: null, min_validity_days: 0, is_mandatory: true, is_active: true, ...o,
  })
  it('requisitos aplicáveis e satisfeitos', () => {
    expect(requirementApplies(req({ category_id: 'c1' }), ['c2'])).toBe(false)
    expect(requirementApplies(req({ category_id: 'c1' }), ['c1'])).toBe(true)
    expect(requirementApplies(req({ is_active: false }), [])).toBe(false)
    const ok = { document_type_id: 't1', status: 'approved' as const, valid_until: '2026-12-31' }
    expect(requirementSatisfied(req(), [ok], NOW)).toBe(true)
    expect(requirementSatisfied(req({ min_validity_days: 90 }), [ok], NOW)).toBe(false)
    expect(requirementSatisfied(req(), [{ ...ok, document_type_id: 't2' }], NOW)).toBe(false)
    expect(requirementSatisfied(req(), [{ ...ok, valid_until: '2026-01-01' }], NOW)).toBe(false)
    expect(requirementSatisfied(req(), [{ ...ok, status: 'submitted' as never }], NOW)).toBe(false)
  })
  it('validação de ficheiros', () => {
    const t = { max_size_mb: 1, allowed_mime: ['application/pdf'] }
    expect(validateUpload({ name: 'a.pdf', size: 100, type: 'application/pdf' }, t)).toBeNull()
    expect(validateUpload({ name: 'a.exe', size: 100, type: 'application/x-msdownload' }, t)).toMatch(/Tipo/)
    expect(validateUpload({ name: 'a.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' }, t)).toMatch(/limite/)
    expect(safeFileName('Relatório Técnico (final).pdf')).toBe('Relatorio_Tecnico_final_.pdf')
  })
})

describe('perfil, prazos e avaliação', () => {
  it('campos em falta (mesma regra do servidor)', () => {
    expect(missingProfileFields({ legal_name: 'A', nif: '1', phone: ' ' }, 0, ['legal_name', 'phone', 'services', 'email'])).toEqual(['phone', 'services', 'email'])
    expect(missingProfileFields({ legal_name: 'A' }, 2, ['legal_name', 'services'])).toEqual([])
  })
  it('prazo final e efectivo com extensões gerais e dirigidas', () => {
    const opp = { deadline: '2026-10-30T12:00:00Z' }
    const ext = [
      { new_deadline: '2026-11-02T12:00:00Z', supplier_org_id: null },
      { new_deadline: '2026-11-10T12:00:00Z', supplier_org_id: 'S1' },
    ]
    expect(finalDeadline(opp, ext).toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(effectiveDeadline(opp, ext, 'S1').toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(effectiveDeadline(opp, ext, 'S2').toISOString()).toBe('2026-11-02T12:00:00.000Z')
  })
  it('estado do prazo e submissão', () => {
    expect(deadlineState(new Date('2026-10-24T09:00:00Z'), NOW)).toBe('passed')
    expect(deadlineState(new Date('2026-10-25T09:00:00Z'), NOW)).toBe('closing_soon')
    expect(deadlineState(new Date('2026-11-25T09:00:00Z'), NOW)).toBe('open')
    expect(canSubmitProposal('open', new Date('2026-10-24T11:00:00Z'), NOW).ok).toBe(true)
    expect(canSubmitProposal('open', new Date('2026-10-24T09:00:00Z'), NOW).ok).toBe(false)
    expect(canSubmitProposal('draft', new Date('2027-01-01'), NOW).ok).toBe(false)
  })
  it('matriz de transições não permite adjudicar directamente', () => {
    expect(allowedTransitions('open')).not.toContain('awarded')
    expect(allowedTransitions('archived')).toEqual([])
    expect(allowedTransitions('draft')).toContain('published')
  })
  const crit = (id: string, weight: number): EvaluationCriterion => ({ id, opportunity_id: 'o', position: 1, name: id, description: null, weight, kind: 'technical' })
  it('pesos e nota ponderada', () => {
    expect(weightsValid([crit('a', 60), crit('b', 40)])).toBe(true)
    expect(weightsValid([crit('a', 60), crit('b', 30)])).toBe(false)
    expect(weightsValid([])).toBe(true)
    const m = evaluationMatrix(['p1', 'p2'], [crit('a', 60), crit('b', 40)], [
      { proposal_id: 'p1', criterion_id: 'a', score: 8 }, { proposal_id: 'p1', criterion_id: 'a', score: 6 },
      { proposal_id: 'p1', criterion_id: 'b', score: 10 }, { proposal_id: 'p2', criterion_id: 'a', score: 9 },
    ])
    expect(m[0].weighted).toBe(8.2) // (60×7 + 40×10)/100
    expect(m[1].weighted).toBeNull() // falta critério: não assume zero
    expect(m[1].missing).toBe(1)
  })
})

describe('validação, erros e permissões', () => {
  it('NIF', () => {
    expect(isValidNif('5417012345')).toBe(true)
    expect(isValidNif('123')).toBe(false)
    expect(isValidNif('000123456LA041')).toBe(true)
  })
  it('esquemas de formulário', () => {
    expect(loginSchema.safeParse({ email: 'x', password: '' }).success).toBe(false)
    expect(passwordSchema.safeParse('curta1').success).toBe(false)
    expect(passwordSchema.safeParse('Palavra1234').success).toBe(true)
    const base = { full_name: 'Maria Silva', email: 'm@x.ao', password: 'Palavra1234', confirm: 'Palavra1234', legal_name: 'Empresa', nif: '5417012345', org_type: 'supplier', sector: 'x', province: 'Luanda', municipality: 'Belas', phone: '9', accept: true }
    expect(registerSchema.safeParse(base).success).toBe(true)
    expect(registerSchema.safeParse({ ...base, confirm: 'outra' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, accept: false }).success).toBe(false)
  })
  it('mensagens de erro compreensíveis', () => {
    expect(friendlyError(new Error('DEADLINE_PASSED'))).toMatch(/prazo/i)
    expect(friendlyError({ message: 'PROFILE_INCOMPLETE: nif,phone' })).toContain('nif, phone')
    expect(friendlyError({ message: 'new row violates row-level security policy' })).toMatch(/permissão/)
    expect(friendlyError({ message: 'boom stacktrace' })).not.toContain('stacktrace')
  })
  it('permissões efectivas', () => {
    const ctx = { platform_permissions: ['admin.access'] } as UserContext
    const s = permissionSet(ctx, { permissions: ['org.view'] } as never)
    expect(can(s, 'admin.access')).toBe(true)
    expect(can(s, 'org.view')).toBe(true)
    expect(can(s, 'document.review')).toBe(false)
  })
})

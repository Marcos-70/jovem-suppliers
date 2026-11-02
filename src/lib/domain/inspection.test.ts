import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calcInspectionLine, inspectionCsv, summarizeMap, validateInspectionLine, withinTolerance } from './inspection'

const vectors = JSON.parse(readFileSync(resolve(process.cwd(), 'supabase/tests/inspection_vectors.json'), 'utf8')) as { declared: string; counted: string; damaged: string; unitWeight: string | null; diff: number; good: number; diffPct: number | null; weightKg: number | null }[]

describe('cálculo de mapas de inspecção (paridade com as colunas calculadas do SQL)', () => {
  it.each(vectors.map((v, i) => [i + 1, v] as const))('vector %i', (_i, v) => {
    expect(calcInspectionLine({ declared: v.declared, counted: v.counted, damaged: v.damaged, unitWeight: v.unitWeight })).toEqual({ diff: v.diff, good: v.good, diffPct: v.diffPct, weightKg: v.weightKg })
  })
  it('tolerância: dentro, fora e sem declarada', () => {
    expect(withinTolerance(-0.5, 0.5)).toBe(true)
    expect(withinTolerance(-0.51, 0.5)).toBe(false)
    expect(withinTolerance(null, 0.5)).toBeNull()
  })
  it('validação de linhas', () => {
    expect(validateInspectionLine({ item_description: 'x', declared: 1, counted: 1, damaged: 0 })).toMatch(/Descreva/)
    expect(validateInspectionLine({ item_description: 'Arroz', declared: 1, counted: 1, damaged: 2 })).toMatch(/avariadas/)
    expect(validateInspectionLine({ item_description: 'Arroz', declared: 1, counted: 1, damaged: 0 })).toBeNull()
  })
  it('totais por unidade: não mistura unidades e só pesa linhas com peso unitário', () => {
    const s = summarizeMap([
      { unit: 'saco', declared: 1000, counted: 990, damaged: 10, unitWeight: 50 },
      { unit: 'saco', declared: 500, counted: 505, damaged: 0, unitWeight: 25 },
      { unit: 't', declared: 20, counted: 19.9, damaged: 0 },
    ], 0.5)
    const sacos = s.byUnit.find((u) => u.unit === 'saco')!
    expect(sacos).toMatchObject({ declared: 1500, counted: 1495, damaged: 10, good: 1485, diff: -5, diffPct: -0.33, lines: 2, outOfTolerance: 2 }) // −1 % e +1 % excedem 0,5 %
    expect(sacos.weightKg).toBe(49000 + 12625) // 980×50 + 505×25
    const t = s.byUnit.find((u) => u.unit === 't')!
    expect(t.weightKg).toBeNull(); expect(t.linesWithoutWeight).toBe(1); expect(t.outOfTolerance).toBe(0) // 19,9 sobre 20 = −0,5 %: está exactamente na tolerância
    expect(s.totalWeightKg).toBe(61625)
  })
  it('exporta CSV com metadados e escapa texto', () => {
    const csv = inspectionCsv({ number: 'MCI-1', title: 'Mapa "A"', vessel_name: null, inspection_date: '2026-10-27', tolerance_pct: 0.5, status: 'draft' },
      [{ hold_ref: 'P1', item_description: 'Trigo; lote 2', lot_ref: null, unit: 'saco', declared_qty: 10, counted_qty: 9, damaged_qty: 0, unit_weight_kg: 50, condition: null }], '27/10/2026 10:00', 'Ana')
    expect(csv.startsWith('\uFEFF')).toBe(true); expect(csv).toContain('"Mapa ""A"""'); expect(csv).toContain('"Trigo; lote 2"'); expect(csv).toContain('-10')
  })
})

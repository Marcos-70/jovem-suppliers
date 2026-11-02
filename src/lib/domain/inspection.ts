import Decimal from 'decimal.js'

// Regras iguais às colunas calculadas de public.inspection_map_lines (testadas com vectores partilhados).
const D = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP, precision: 40 })

export interface LineInput { declared: number | string; counted: number | string; damaged?: number | string; unitWeight?: number | string | null }
export interface LineCalc { diff: number; good: number; diffPct: number | null; weightKg: number | null }

/** diff = contada − declarada · boa = contada − avariada · diff% = arred(diff÷declarada×100, 2) · peso = arred(boa×peso unitário, 3) */
export function calcInspectionLine(i: LineInput): LineCalc {
  const declared = new D(i.declared || 0), counted = new D(i.counted || 0), damaged = new D(i.damaged || 0)
  const diff = counted.minus(declared), good = counted.minus(damaged)
  const hasW = i.unitWeight !== null && i.unitWeight !== undefined && i.unitWeight !== ''
  return {
    diff: diff.toNumber(), good: good.toNumber(),
    diffPct: declared.gt(0) ? diff.times(100).div(declared).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() : null,
    weightKg: hasW ? good.times(i.unitWeight as number).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber() : null,
  }
}

export function validateInspectionLine(i: { item_description: string; declared: number; counted: number; damaged: number; unitWeight?: number | null }): string | null {
  if (i.item_description.trim().length < 2) return 'Descreva a mercadoria'
  if (i.declared < 0 || i.counted < 0 || i.damaged < 0) return 'Quantidades não podem ser negativas'
  if (i.damaged > i.counted) return 'As avariadas não podem exceder as contadas'
  if (i.unitWeight != null && i.unitWeight < 0) return 'Peso unitário inválido'
  return null
}

/** true = dentro da tolerância; null = sem quantidade declarada (não é possível avaliar). */
export const withinTolerance = (diffPct: number | null, tolerancePct: number): boolean | null => (diffPct === null ? null : Math.abs(diffPct) <= tolerancePct)

export interface UnitTotals { unit: string; declared: number; counted: number; damaged: number; good: number; diff: number; diffPct: number | null; weightKg: number | null; linesWithoutWeight: number; outOfTolerance: number; lines: number }
export interface MapSummary { byUnit: UnitTotals[]; totalWeightKg: number | null; outOfToleranceLines: number; lines: number }

/** Totais por unidade: nunca se somam unidades diferentes (sacos + toneladas). O peso só soma linhas com peso unitário. */
export function summarizeMap(lines: { unit: string; declared: number; counted: number; damaged: number; unitWeight?: number | null }[], tolerancePct: number): MapSummary {
  const m = new Map<string, { d: Decimal; c: Decimal; x: Decimal; w: Decimal; nw: number; oot: number; n: number; anyW: boolean }>()
  let totalW = new D(0), anyW = false, oot = 0
  for (const l of lines) {
    const calc = calcInspectionLine({ declared: l.declared, counted: l.counted, damaged: l.damaged, unitWeight: l.unitWeight })
    const g = m.get(l.unit) ?? { d: new D(0), c: new D(0), x: new D(0), w: new D(0), nw: 0, oot: 0, n: 0, anyW: false }
    g.d = g.d.plus(l.declared || 0); g.c = g.c.plus(l.counted || 0); g.x = g.x.plus(l.damaged || 0); g.n++
    if (calc.weightKg === null) g.nw++; else { g.w = g.w.plus(calc.weightKg); g.anyW = true; totalW = totalW.plus(calc.weightKg); anyW = true }
    if (withinTolerance(calc.diffPct, tolerancePct) === false) { g.oot++; oot++ }
    m.set(l.unit, g)
  }
  const byUnit = [...m.entries()].map(([unit, g]) => {
    const diff = g.c.minus(g.d)
    return { unit, declared: g.d.toNumber(), counted: g.c.toNumber(), damaged: g.x.toNumber(), good: g.c.minus(g.x).toNumber(), diff: diff.toNumber(),
      diffPct: g.d.gt(0) ? diff.times(100).div(g.d).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() : null,
      weightKg: g.anyW ? g.w.toNumber() : null, linesWithoutWeight: g.nw, outOfTolerance: g.oot, lines: g.n }
  })
  return { byUnit, totalWeightKg: anyW ? totalW.toNumber() : null, outOfToleranceLines: oot, lines: lines.length }
}

export function inspectionCsv(map: { number: string; title: string; vessel_name: string | null; inspection_date: string; tolerance_pct: number; status: string },
  lines: { hold_ref: string | null; item_description: string; lot_ref: string | null; unit: string; declared_qty: number; counted_qty: number; damaged_qty: number; unit_weight_kg: number | null; condition: string | null }[],
  generatedAt: string, who: string): string {
  const e = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const head = [['Mapa', map.number], ['Título', map.title], ['Navio', map.vessel_name ?? ''], ['Data da inspecção', map.inspection_date], ['Tolerância (%)', map.tolerance_pct], ['Estado', map.status], ['Gerado em', generatedAt], ['Gerado por', who]]
  const out = head.map((r) => r.map(e).join(';')), nl = ['', ['Porão/Local', 'Mercadoria', 'Lote', 'Unidade', 'Declarada', 'Contada', 'Avariada', 'Diferença', 'Diferença %', 'Boa', 'Peso unit. (kg)', 'Peso líquido (kg)', 'Estado/Condição'].map(e).join(';')]
  for (const l of lines) { const c = calcInspectionLine({ declared: l.declared_qty, counted: l.counted_qty, damaged: l.damaged_qty, unitWeight: l.unit_weight_kg }); nl.push([l.hold_ref, l.item_description, l.lot_ref, l.unit, l.declared_qty, l.counted_qty, l.damaged_qty, c.diff, c.diffPct, c.good, l.unit_weight_kg, c.weightKg, l.condition].map(e).join(';')) }
  return '\uFEFF' + [...out, ...nl].join('\r\n')
}

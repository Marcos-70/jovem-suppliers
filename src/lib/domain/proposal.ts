import Decimal from 'decimal.js'

// Aritmética decimal exacta; arredondamento a 2 casas, metade afastada de zero
// (igual ao round() de numeric do PostgreSQL, usado em public.calc_line).
const D = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP, precision: 40 })

export interface LineInput { quantity: number | string; unitPrice: number | string; discountPct?: number | string; taxPct?: number | string }
export interface LineResult { gross: number; discount: number; subtotal: number; tax: number; total: number }

const r2 = (x: Decimal) => x.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

/**
 * Regra única de cálculo (espelhada em public.calc_line):
 *   bruto = arred(qtd × preço); desconto = arred(bruto × desc%); subtotal = bruto − desconto
 *   imposto = arred(subtotal × imposto%); total = subtotal + imposto
 */
export function calcLine(i: LineInput): LineResult {
  const gross = r2(new D(i.quantity).times(i.unitPrice))
  const discount = r2(gross.times(i.discountPct ?? 0).div(100))
  const subtotal = gross.minus(discount)
  const tax = r2(subtotal.times(i.taxPct ?? 0).div(100))
  return {
    gross: gross.toNumber(), discount: discount.toNumber(), subtotal: subtotal.toNumber(),
    tax: tax.toNumber(), total: subtotal.plus(tax).toNumber(),
  }
}

export interface ProposalTotals { subtotal: number; discountTotal: number; taxTotal: number; total: number }

/** Totais da proposta = soma das linhas (bruto como "subtotal" antes de descontos). */
export function calcProposal(lines: LineInput[]): ProposalTotals & { lines: LineResult[] } {
  const results = lines.map(calcLine)
  const sum = (k: keyof LineResult) => results.reduce((a, l) => a.plus(l[k]), new D(0)).toNumber()
  return {
    lines: results, subtotal: sum('gross'), discountTotal: sum('discount'),
    taxTotal: sum('tax'), total: sum('total'),
  }
}

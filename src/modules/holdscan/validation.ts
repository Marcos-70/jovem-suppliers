// Estatística de validação de precisão. Nada é «validado» por defeito: só há veredicto com registos reais.
export interface ValidationSample { scan_id: string | null; reference_label: string; physical: number; scanned: number; device_label: string; method: string }
export interface Criteria { min_samples: number; min_distinct_scans: number; max_mean_abs_error_pct: number; max_single_error_pct: number; provisional?: boolean }
export const DEFAULT_CRITERIA: Criteria = { min_samples: 10, min_distinct_scans: 3, max_mean_abs_error_pct: 1, max_single_error_pct: 2, provisional: true }

export interface ErrorStats { n: number; biasPct: number | null; meanAbsPct: number | null; rmsePct: number | null; sdPct: number | null; maxAbsPct: number | null; meanAbsM: number | null; maxAbsM: number | null; distinctScans: number }
const r3 = (x: number) => Math.round(x * 1000) / 1000

export function errorStats(s: ValidationSample[]): ErrorStats {
  const n = s.length
  if (!n) return { n: 0, biasPct: null, meanAbsPct: null, rmsePct: null, sdPct: null, maxAbsPct: null, meanAbsM: null, maxAbsM: null, distinctScans: 0 }
  const pct = s.map((x) => ((x.scanned - x.physical) / x.physical) * 100), abs = s.map((x) => x.scanned - x.physical)
  const mean = pct.reduce((a, b) => a + b, 0) / n
  const sd = n > 1 ? Math.sqrt(pct.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
  return {
    n, biasPct: r3(mean), meanAbsPct: r3(pct.reduce((a, b) => a + Math.abs(b), 0) / n), rmsePct: r3(Math.sqrt(pct.reduce((a, b) => a + b * b, 0) / n)), sdPct: r3(sd),
    maxAbsPct: r3(Math.max(...pct.map(Math.abs))), meanAbsM: r3(abs.reduce((a, b) => a + Math.abs(b), 0) / n), maxAbsM: r3(Math.max(...abs.map(Math.abs))),
    distinctScans: new Set(s.map((x) => x.scan_id ?? 'sem-digitalizacao')).size,
  }
}

export type Verdict = 'sem_dados' | 'insuficiente' | 'reprovado' | 'cumpre_criterios_provisorios'
export interface Evaluation { verdict: Verdict; stats: ErrorStats; reasons: string[] }

/** «cumpre_criterios_provisorios» NÃO equivale a «preciso»: só indica que os critérios mínimos definidos foram cumpridos nestas amostras. */
export function evaluateValidation(s: ValidationSample[], c: Criteria = DEFAULT_CRITERIA): Evaluation {
  const stats = errorStats(s), reasons: string[] = []
  if (!stats.n) return { verdict: 'sem_dados', stats, reasons: ['Sem medições de validação registadas.'] }
  if (stats.n < c.min_samples) reasons.push(`Amostras insuficientes: ${stats.n} de ${c.min_samples}.`)
  if (stats.distinctScans < c.min_distinct_scans) reasons.push(`Digitalizações distintas insuficientes: ${stats.distinctScans} de ${c.min_distinct_scans}.`)
  if (reasons.length) return { verdict: 'insuficiente', stats, reasons }
  if ((stats.meanAbsPct as number) > c.max_mean_abs_error_pct) reasons.push(`Erro absoluto médio ${stats.meanAbsPct}% excede ${c.max_mean_abs_error_pct}%.`)
  if ((stats.maxAbsPct as number) > c.max_single_error_pct) reasons.push(`Erro máximo ${stats.maxAbsPct}% excede ${c.max_single_error_pct}%.`)
  return reasons.length ? { verdict: 'reprovado', stats, reasons } : { verdict: 'cumpre_criterios_provisorios', stats, reasons: ['Cumpre os critérios mínimos (provisórios) nestas amostras. Não é uma garantia de exactidão noutras condições.'] }
}

export const VERDICT_LABEL: Record<Verdict, { text: string; tone: 'neutral' | 'warn' | 'danger' | 'info' }> = {
  sem_dados: { text: 'Sem validação', tone: 'neutral' }, insuficiente: { text: 'Validação incompleta', tone: 'warn' },
  reprovado: { text: 'Não cumpre os critérios', tone: 'danger' }, cumpre_criterios_provisorios: { text: 'Cumpre critérios provisórios', tone: 'info' },
}

export function groupByConfig(s: ValidationSample[]): Map<string, ValidationSample[]> {
  const m = new Map<string, ValidationSample[]>()
  for (const x of s) { const k = `${x.device_label}|${x.method}`; m.set(k, [...(m.get(k) ?? []), x]) }
  return m
}

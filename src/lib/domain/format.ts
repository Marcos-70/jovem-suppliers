const TZ = 'Africa/Luanda'
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(d: Date) {
  const f = new Intl.DateTimeFormat('pt-PT', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(d)) o[p.type] = p.value
  return o
}

/** DD/MM/AAAA. Datas sem hora (AAAA-MM-DD) não sofrem deslocação de fuso. */
export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return '—'
  if (typeof v === 'string') {
    const m = DATE_ONLY.exec(v)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }
  const d = typeof v === 'string' ? new Date(v) : v
  if (Number.isNaN(d.getTime())) return '—'
  const p = parts(d)
  return `${p.day}/${p.month}/${p.year}`
}

export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = typeof v === 'string' ? new Date(v) : v
  if (Number.isNaN(d.getTime())) return '—'
  const p = parts(d)
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

/** Data de hoje (AAAA-MM-DD) no fuso Africa/Luanda. */
export function todayLuanda(now: Date = new Date()): string {
  const p = parts(now)
  return `${p.year}-${p.month}-${p.day}`
}

/** Dias inteiros entre hoje (Luanda) e uma data AAAA-MM-DD. Negativo = já passou. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const a = DATE_ONLY.exec(date)
  const b = DATE_ONLY.exec(todayLuanda(now))
  if (!a || !b) return Number.NaN
  const t = (m: RegExpExecArray) => Date.UTC(+m[1], +m[2] - 1, +m[3])
  return Math.round((t(a) - t(b)) / 86_400_000)
}

/** Número com separador de milhares (espaço não separável) e vírgula decimal. */
export function formatNumber(n: number | string, decimals = 2): string {
  const x = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(x)) return '—'
  const neg = x < 0
  const [int, frac] = Math.abs(x).toFixed(decimals).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')
  return `${neg ? '-' : ''}${grouped}${frac ? ',' + frac : ''}`
}

/** Valores monetários com a moeda sempre explícita: "1 250 000,00 AOA". */
export function formatMoney(n: number | string | null | undefined, currency: string): string {
  if (n === null || n === undefined || n === '') return '—'
  return `${formatNumber(n, 2)}\u00A0${currency}`
}

export function formatPercent(n: number | null, decimals = 1): string {
  return n === null ? 'Sem dados disponíveis' : `${formatNumber(n, decimals)}%`
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(hours: number | null): string {
  if (hours === null) return 'Sem dados disponíveis'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${formatNumber(hours, 1)} h`
  return `${formatNumber(hours / 24, 1)} dias`
}

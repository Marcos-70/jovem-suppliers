import { AlertTriangle, CheckCircle2, Circle, Info, Loader2, X, XCircle } from 'lucide-react'
import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { Label, Tone } from '@/lib/domain/labels'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ---------------------------------------------------------------- Marca */
/** Símbolo: anel aberto com o «i» dourado (identidade Jovem+). */
export function LogoMark({ size = 36, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M33 22.5a13 13 0 1 1-6.2-11.1" fill="none" stroke={light ? '#fff' : '#0A1E45'} strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="20" cy="12.5" r="2.7" fill="#FFC107" /><rect x="17.8" y="17.5" width="4.4" height="12" rx="2.2" fill="#FFC107" />
    </svg>
  )
}
export function Logo({ light = false, size = 36 }: { light?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark light={light} size={size} />
      <span className="flex flex-col leading-none">
        <span className={cx('font-display text-[22px] font-extrabold tracking-tight', light ? 'text-white' : 'text-navy')}>Jovem<span className="text-gold">+</span></span>
        <span className={cx('mt-0.5 text-[9.5px] font-semibold tracking-[0.34em]', light ? 'text-white/80' : 'text-ink-soft')}>SUPPLIERS</span>
      </span>
    </span>
  )
}

/* -------------------------------------------------------------- Botões */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; small?: boolean; loading?: boolean }
export function Button({ variant = 'primary', small, loading, className, children, disabled, type = 'button', ...p }: BtnProps) {
  return (
    <button type={type} disabled={disabled || loading} className={cx(`btn-${variant}`, small && 'btn-sm', className)} {...p}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/* ---------------------------------------------------------- Formulários */
interface FieldProps { label: string; error?: string; hint?: string; required?: boolean; children: (id: string, describedBy: string | undefined) => ReactNode; className?: string }
export function Field({ label, error, hint, required, children, className }: FieldProps) {
  const id = useId()
  const desc = error ? `${id}-e` : hint ? `${id}-h` : undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}{required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}</label>
      {children(id, desc)}
      {error ? <p id={`${id}-e`} role="alert" className="field-error"><XCircle className="h-4 w-4 shrink-0" aria-hidden />{error}</p> : hint ? <p id={`${id}-h`} className="hint">{hint}</p> : null}
    </div>
  )
}
// forwardRef é indispensável: o react-hook-form lê os valores através do ref.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cx('input', className)} {...p} />)
Input.displayName = 'Input'
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 3, ...p }, ref) => <textarea ref={ref} rows={rows} className={cx('input', className)} {...p} />)
Textarea.displayName = 'Textarea'
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} className={cx('input pr-8', className)} {...p}>{children}</select>)
Select.displayName = 'Select'

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: string }>(({ label, hint, ...p }, ref) => {
  const id = useId()
  return (
    <div className="flex items-start gap-2.5">
      <input ref={ref} id={id} type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-line-strong accent-brand-700" {...p} />
      <label htmlFor={id} className="text-[15px] leading-snug text-ink">{label}{hint && <span className="hint block">{hint}</span>}</label>
    </div>
  )
})
Checkbox.displayName = 'Checkbox'

/* ---------------------------------------------------------- Estado/Selos */
const TONE: Record<Tone, { cls: string; bd: string; Icon: typeof Info }> = {
  ok: { cls: 'bg-ok-bg text-ok', bd: 'border-ok/30', Icon: CheckCircle2 },
  warn: { cls: 'bg-warn-bg text-warn', bd: 'border-warn/30', Icon: AlertTriangle },
  danger: { cls: 'bg-danger-bg text-danger', bd: 'border-danger/30', Icon: XCircle },
  info: { cls: 'bg-info-bg text-info', bd: 'border-info/30', Icon: Info },
  neutral: { cls: 'bg-slate-100 text-ink-soft', bd: 'border-line', Icon: Circle },
}
/** O estado nunca depende só da cor: ícone + texto. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const { cls, Icon } = TONE[tone]
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', cls)}><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />{children}</span>
}
export const StatusBadge = ({ label }: { label: Label }) => <Badge tone={label.tone}>{label.text}</Badge>

export function Alert({ tone = 'info', title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  const { cls, bd, Icon } = TONE[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-card border p-4', cls, bd)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-[15px] text-ink">
        {title && <p className="font-display font-semibold" style={{ color: 'inherit' }}>{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function Spinner({ label = 'A carregar…' }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2 py-12 text-ink-soft"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{label}</div>
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="card card-pad text-center" role="alert">
      <XCircle className="mx-auto h-8 w-8 text-danger" aria-hidden />
      <p className="mt-2 font-display font-semibold text-navy">Não foi possível carregar os dados</p>
      <p className="mt-1 text-sm text-ink-soft">{(error as Error)?.message && /PERMISSION|row-level/i.test((error as Error).message) ? 'Não tem permissão para ver esta informação.' : 'Verifique a ligação e tente novamente.'}</p>
      {retry && <Button variant="secondary" small className="mt-3" onClick={retry}>Tentar novamente</Button>}
    </div>
  )
}
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-700" aria-hidden>{icon}</div>}
      <p className="font-display text-lg font-semibold text-navy">{title}</p>
      {children && <p className="mt-1 max-w-md text-[15px] text-ink-soft">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6">
      {back && <div className="mb-2 text-sm">{back}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-[15px] text-ink-soft">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function StatCard({ label, value, hint, icon, tone = 'neutral' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  const chip = { ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', danger: 'bg-danger-bg text-danger', info: 'bg-info-bg text-info', neutral: 'bg-gold-50 text-gold-700' }[tone]
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-soft">{label}</p>
        {icon && <span className={cx('rounded-lg p-1.5', chip)} aria-hidden>{icon}</span>}
      </div>
      <p className="mt-1.5 font-display text-[30px] font-bold leading-none text-navy">{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-mute">{hint}</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- Modal */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')
    ;(first ?? ref.current)?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]')]
        if (!f.length) return
        const a = f[0], z = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-card', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button data-close aria-label="Fechar" onClick={onClose} className="rounded-md p-1.5 text-ink-soft hover:bg-surface"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', danger, loading, onConfirm, onClose, children }: { open: boolean; title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {message && <p className="text-[15px] text-ink">{message}</p>}
      {children}
    </Modal>
  )
}

/* ----------------------------------------------------------------- Abas */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={value === t.id} aria-controls={`panel-${t.id}`} onClick={() => onChange(t.id)}
          className={cx('-mb-px whitespace-nowrap border-b-[3px] px-4 py-2.5 text-[15px] font-semibold', value === t.id ? 'border-brand text-navy' : 'border-transparent text-ink-soft hover:text-navy')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-surface px-1.5 text-xs font-bold text-ink-soft">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
export const TabPanel = ({ id, active, children }: { id: string; active: boolean; children: ReactNode }) =>
  active ? <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div> : null

/* ---------------------------------------------------------- Tabela de dados */
export interface Column<T> { key: string; header: string; cell: (row: T) => ReactNode; align?: 'right'; sort?: (a: T, b: T) => number; className?: string }
export function DataTable<T>({ rows, columns, rowKey, caption, empty, pageSize = 10, onRowClick }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; caption: string; empty?: ReactNode; pageSize?: number; onRowClick?: (r: T) => void }) {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null)
  useEffect(() => setPage(0), [rows.length])
  const sorted = (() => { const c = columns.find((x) => x.key === sort?.key); if (!c?.sort) return rows; const s = [...rows].sort(c.sort); return sort!.asc ? s : s.reverse() })()
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize)
  if (!rows.length) return <div className="card">{empty ?? <EmptyState title="Sem resultados" />}</div>
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx('th', c.align === 'right' && 'text-right')} aria-sort={sort?.key === c.key ? (sort.asc ? 'ascending' : 'descending') : undefined}>
                {c.sort ? <button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort({ key: c.key, asc: sort?.key === c.key ? !sort.asc : true })}>{c.header}<span aria-hidden>{sort?.key === c.key ? (sort.asc ? '▲' : '▼') : '↕'}</span></button> : c.header}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={rowKey(r)} className={cx('hover:bg-brand-50/50', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={cx('td', c.align === 'right' && 'text-right tabular-nums', c.className)}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && <Pagination page={page} pages={pages} total={sorted.length} onChange={setPage} />}
    </div>
  )
}
export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (p: number) => void }) {
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm">
      <span className="text-ink-soft">{total} registos · página {page + 1} de {pages}</span>
      <span className="flex gap-2">
        <Button variant="secondary" small disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</Button>
        <Button variant="secondary" small disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>Seguinte</Button>
      </span>
    </nav>
  )
}

/* ------------------------------------------------------------- Toasts */
interface ToastItem { id: number; tone: 'ok' | 'danger' | 'info'; text: string }
const ToastCtx = createContext<{ success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }>({ success() {}, error() {}, info() {} })
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((tone: ToastItem['tone'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, tone, text }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), tone === 'danger' ? 8000 : 4500)
  }, [])
  const api = { success: (t: string) => push('ok', t), error: (t: string) => push('danger', t), info: (t: string) => push('info', t) }
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const { cls, Icon } = TONE[t.tone]
          return <div key={t.id} role={t.tone === 'danger' ? 'alert' : 'status'} className={cx('pointer-events-auto flex items-start gap-2.5 rounded-card border border-line bg-white p-3.5 shadow-pop')}><span className={cx('rounded-full p-1', cls)}><Icon className="h-4 w-4" aria-hidden /></span><p className="text-[15px] text-ink">{t.text}</p></div>
        })}
      </div>
    </ToastCtx.Provider>
  )
}

/* ------------------------------------------------------ Ficheiro (dropzone) */
export function FilePicker({ file, onChange, accept, hint }: { file: File | null; onChange: (f: File | null) => void; accept?: string; hint?: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer flex-col items-center gap-1 rounded-card border-2 border-dashed border-line-strong bg-surface px-4 py-6 text-center hover:border-brand">
        <span className="font-semibold text-navy">{file ? file.name : 'Seleccionar ficheiro'}</span>
        <span className="text-sm text-ink-mute">{file ? `${(file.size / 1024).toFixed(0)} KB` : hint ?? 'PDF, JPG ou PNG'}</span>
      </label>
      <input id={id} type="file" accept={accept} className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </div>
  )
}

export function DescriptionList({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3')}>
      {items.map((i) => (
        <div key={i.label}><dt className="text-xs font-bold uppercase tracking-wide text-ink-mute">{i.label}</dt><dd className="mt-0.5 text-[15px] text-ink">{i.value || '—'}</dd></div>
      ))}
    </dl>
  )
}

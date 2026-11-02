import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Alert, Button, EmptyState, ErrorState, Field, Input, PageHeader, Select, Spinner, StatCard, cx, useToast, DataTable, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useReportData } from '@/hooks/useReportData'
import { formatDateTime } from '@/lib/domain/format'
import { P } from '@/lib/domain/permissions'
import { REPORTS, toCsv, type ReportFilters } from '@/lib/domain/reports'
import { CURRENCIES } from '@/lib/domain/labels'

export default function Reports() {
  const a = useAuth(), toast = useToast()
  const rd = useReportData()
  const [sel, setSel] = useState(REPORTS[0].id)
  const [f, setF] = useState<ReportFilters>({})
  const def = REPORTS.find((r) => r.id === sel)!
  const res = useMemo(() => (rd.data ? def.build(rd.data, f) : null), [rd.data, def, f])
  if (rd.isLoading) return <Spinner label="A preparar relatórios…" />
  if (rd.isError || !rd.data || !res) return <ErrorState error={rd.error} retry={() => rd.refetch()} />
  const d = rd.data
  const cols: Column<Record<string, string | number | null>>[] = res.columns.map((c) => ({ key: c.key, header: c.label, align: c.align, cell: (r) => (r[c.key] ?? '—') }))
  const exportCsv = () => {
    const csv = toCsv(def, res, f, new Date(), a.ctx?.profile.full_name ?? a.email ?? '')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const el = document.createElement('a'); el.href = url; el.download = `${def.id}-${new Date().toISOString().slice(0, 10)}.csv`; el.click(); URL.revokeObjectURL(url)
    toast.success('Exportação gerada com os mesmos dados mostrados no ecrã.')
  }
  const opps = d.opportunities.filter((o) => o.number)
  return (
    <>
      <PageHeader title="Relatórios" subtitle="Calculados a partir dos dados reais a que a sua função dá acesso, com definições documentadas." />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <nav aria-label="Relatórios disponíveis" className="space-y-1">
          {REPORTS.map((r) => <button key={r.id} onClick={() => { setSel(r.id); setF({}) }} aria-current={sel === r.id} className={cx('w-full rounded-lg border px-3 py-2.5 text-left', sel === r.id ? 'border-brand bg-brand-50' : 'border-line bg-white hover:border-line-strong')}><span className="block text-[15px] font-semibold text-navy">{r.title}</span><span className="block text-xs text-ink-mute">{r.description}</span></button>)}
        </nav>
        <div className="min-w-0 space-y-4">
          <div className="card card-pad">
            <div className="flex flex-wrap items-end gap-3">
              {def.filters.includes('period') && <><Field label={`De (${def.dateField})`}>{(i) => <Input id={i} type="date" className="w-44" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} />}</Field><Field label="Até">{(i) => <Input id={i} type="date" className="w-44" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} />}</Field></>}
              {def.filters.includes('status') && <Field label="Estado">{(i) => <Select id={i} className="w-52" value={f.status ?? ''} onChange={(e) => setF({ ...f, status: e.target.value || undefined })}><option value="">Todos</option>{def.statusOptions?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>}
              {def.filters.includes('currency') && <Field label="Moeda">{(i) => <Select id={i} className="w-32" value={f.currency ?? ''} onChange={(e) => setF({ ...f, currency: e.target.value || undefined })}><option value="">Todas</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>}
              {def.filters.includes('opportunity') && <Field label="Pedido">{(i) => <Select id={i} className="w-72" value={f.opportunityId ?? ''} onChange={(e) => setF({ ...f, opportunityId: e.target.value || undefined })}><option value="">Seleccione…</option>{opps.map((o) => <option key={o.id} value={o.id}>{o.number} — {o.title}</option>)}</Select>}</Field>}
              <div className="ml-auto">{a.can(P.reportExport) ? <Button variant="secondary" onClick={exportCsv} disabled={!res.rows.length}><Download className="h-4 w-4" aria-hidden />Exportar CSV</Button> : <span className="text-sm text-ink-mute">A sua função não permite exportar.</span>}</div>
            </div>
            <p className="mt-3 text-xs text-ink-mute">Gerado em {formatDateTime(d.now)} · fuso Africa/Luanda · valores com a moeda de cada linha, sem conversão.</p>
          </div>
          {res.summary.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{res.summary.map((s) => <StatCard key={s.label} label={s.label} value={s.value} />)}</div>}
          <DataTable rows={res.rows} columns={cols} rowKey={(r) => JSON.stringify(r)} caption={def.title} pageSize={12} empty={<EmptyState title="Sem dados disponíveis">Não há registos para estes filtros{res.notes?.[0] ? '. ' + res.notes[0] : '.'}</EmptyState>} />
          <details className="card card-pad"><summary className="cursor-pointer font-semibold text-navy">Como este relatório é calculado</summary>
            <div className="mt-3 space-y-2 text-[15px] text-ink-soft"><p>{def.definition}</p>{res.notes?.map((n) => <p key={n}>{n}</p>)}</div></details>
          {a.isSuper && <Alert tone="info">Como superadministrador, valores comerciais de propostas e decisões não são visíveis; os indicadores usam apenas estados e datas.</Alert>}
        </div>
      </div>
    </>
  )
}

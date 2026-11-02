import { useQuery } from '@tanstack/react-query'
import { Download, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button, ErrorState, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatDateTime, formatNumber } from '@/lib/domain/format'
import { calcInspectionLine, inspectionCsv, summarizeMap, withinTolerance } from '@/lib/domain/inspection'
import { INSPECTION_STATUS } from '@/lib/domain/labels'
import { getInspectionMap } from '@/services/inspections'
import { useOrgNames } from '@/hooks/useOrgNames'

export default function InspectionReport() {
  const { id } = useParams() as { id: string }
  const a = useAuth(), orgs = useOrgNames()
  const q = useQuery({ queryKey: ['inspection', id], queryFn: () => getInspectionMap(id) })
  if (q.isLoading) return <Spinner />
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const { map: m, lines } = q.data
  const sum = summarizeMap(lines.map((l) => ({ unit: l.unit, declared: Number(l.declared_qty), counted: Number(l.counted_qty), damaged: Number(l.damaged_qty), unitWeight: l.unit_weight_kg == null ? null : Number(l.unit_weight_kg) })), Number(m.tolerance_pct))
  const csv = () => {
    const c = inspectionCsv(m, lines, formatDateTime(new Date()), a.ctx?.profile.full_name ?? '')
    const url = URL.createObjectURL(new Blob([c], { type: 'text/csv;charset=utf-8' })), el = document.createElement('a'); el.href = url; el.download = `${m.number}.csv`; el.click(); URL.revokeObjectURL(url)
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden"><Link to={`/app/inspeccoes/${id}`} className="kbd-link">← Voltar ao mapa</Link><div className="flex gap-2"><Button variant="secondary" onClick={csv}><Download className="h-4 w-4" aria-hidden />CSV</Button><Button onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Imprimir / Guardar PDF</Button></div></div>
      <article className="mx-auto max-w-4xl rounded-card border border-line bg-white p-6 text-[14px] print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="border-b-2 border-navy pb-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Mapa de controlo de mercadorias</p><h1 className="text-2xl font-bold">{m.title}</h1>
          <p className="mt-1 text-ink-soft">{m.number} · {orgs.name(m.organization_id)} · {INSPECTION_STATUS[m.status].text}</p></header>
        <dl className="my-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {[['Navio', m.vessel_name], ['Viagem', m.voyage_ref], ['BL', m.bl_ref], ['Porto / local', m.port_location], ['Data', formatDate(m.inspection_date)], ['Dono da carga', m.cargo_owner], ['Mercadoria', m.cargo_description], ['Tolerância', `${formatNumber(Number(m.tolerance_pct), 2)} %`]].map(([k, v]) => <div key={k as string}><dt className="text-[11px] font-bold uppercase text-ink-mute">{k}</dt><dd>{v || '—'}</dd></div>)}
        </dl>
        <table className="w-full border-collapse text-[13px]"><thead><tr>{['#', 'Local', 'Mercadoria / lote', 'Un.', 'Decl.', 'Cont.', 'Avar.', 'Dif.', 'Dif. %', 'Boa', 'Peso líq. (kg)'].map((h) => <th key={h} className="border border-line bg-surface px-2 py-1 text-left text-[11px] uppercase">{h}</th>)}</tr></thead>
          <tbody>{lines.map((l, i) => { const c = calcInspectionLine({ declared: l.declared_qty, counted: l.counted_qty, damaged: l.damaged_qty, unitWeight: l.unit_weight_kg }); const out = withinTolerance(c.diffPct, Number(m.tolerance_pct)) === false
            return <tr key={l.id} className={out ? 'bg-danger-bg/60' : ''}><td className="border border-line px-2 py-1">{i + 1}</td><td className="border border-line px-2 py-1">{l.hold_ref ?? ''}</td><td className="border border-line px-2 py-1">{l.item_description}{l.lot_ref ? ` · lote ${l.lot_ref}` : ''}{l.condition ? <span className="block text-[11px] text-ink-mute">{l.condition}</span> : null}</td><td className="border border-line px-2 py-1">{l.unit}</td>
              {[l.declared_qty, l.counted_qty, l.damaged_qty, c.diff].map((v, k) => <td key={k} className="border border-line px-2 py-1 text-right tabular-nums">{formatNumber(Number(v), 3)}</td>)}<td className="border border-line px-2 py-1 text-right tabular-nums">{c.diffPct === null ? '—' : formatNumber(c.diffPct, 2)}{out ? ' ⚠' : ''}</td><td className="border border-line px-2 py-1 text-right tabular-nums">{formatNumber(c.good, 3)}</td><td className="border border-line px-2 py-1 text-right tabular-nums">{c.weightKg === null ? '—' : formatNumber(c.weightKg, 3)}</td></tr> })}</tbody></table>
        <h2 className="mt-5 text-base font-semibold">Totais por unidade</h2>
        <table className="mt-1 w-full border-collapse text-[13px]"><thead><tr>{['Unidade', 'Declarada', 'Contada', 'Avariada', 'Boa', 'Diferença', 'Dif. %', 'Peso líquido (kg)'].map((h) => <th key={h} className="border border-line bg-surface px-2 py-1 text-left text-[11px] uppercase">{h}</th>)}</tr></thead>
          <tbody>{sum.byUnit.map((u) => <tr key={u.unit}><td className="border border-line px-2 py-1 font-semibold">{u.unit}</td>{[u.declared, u.counted, u.damaged, u.good, u.diff].map((v, i) => <td key={i} className="border border-line px-2 py-1 text-right tabular-nums">{formatNumber(v, 3)}</td>)}<td className="border border-line px-2 py-1 text-right tabular-nums">{u.diffPct === null ? '—' : formatNumber(u.diffPct, 2)}</td><td className="border border-line px-2 py-1 text-right tabular-nums">{u.weightKg === null ? '—' : formatNumber(u.weightKg, 3)}</td></tr>)}</tbody></table>
        <p className="mt-2 text-[12px] text-ink-mute">Linhas fora da tolerância assinaladas com ⚠. Unidades diferentes não são somadas. Pesos calculados apenas para linhas com peso unitário.</p>
        {m.notes && <p className="mt-3"><strong>Observações:</strong> {m.notes}</p>}
        <footer className="mt-8 grid grid-cols-2 gap-8 text-[13px]"><div><div className="h-10 border-b border-ink" /><p className="mt-1">Inspector · {m.inspector_id ? 'registado no sistema' : '—'}</p><p className="text-ink-mute">{m.submitted_at ? `Submetido em ${formatDateTime(m.submitted_at)}` : 'Ainda não submetido'}</p></div><div><div className="h-10 border-b border-ink" /><p className="mt-1">Revisão · {m.status === 'approved' ? 'Aprovado' : m.status === 'returned' ? 'Devolvido' : 'Pendente'}</p><p className="text-ink-mute">{m.reviewed_at ? formatDateTime(m.reviewed_at) : ''}</p></div></footer>
        <p className="mt-6 text-[11px] text-ink-mute">Relatório gerado em {formatDateTime(new Date())} (Africa/Luanda) por {a.ctx?.profile.full_name}. Este documento não é uma assinatura digital certificada.</p>
      </article>
    </div>
  )
}

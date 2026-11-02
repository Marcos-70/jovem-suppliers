import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, FileText, Plus, Save, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Badge, Button, ConfirmDialog, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea, useToast } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { friendlyError } from '@/lib/domain/errors'
import { formatDateTime, formatNumber } from '@/lib/domain/format'
import { calcInspectionLine, summarizeMap, validateInspectionLine, withinTolerance } from '@/lib/domain/inspection'
import { INSPECTION_STATUS, INSPECTION_UNITS } from '@/lib/domain/labels'
import { P } from '@/lib/domain/permissions'
import { getInspectionMap, reviewInspectionMap, saveLines, submitInspectionMap, updateInspectionHeader, type LineForm, type MapHeader } from '@/services/inspections'

interface L { key: string; id?: string; hold_ref: string; item_description: string; lot_ref: string; unit: string; declared: string; counted: string; damaged: string; unitWeight: string; condition: string; notes: string }
const num = (s: string) => (s === '' || Number.isNaN(Number(s)) ? 0 : Number(s))
const blank = (): L => ({ key: crypto.randomUUID(), hold_ref: '', item_description: '', lot_ref: '', unit: 'saco', declared: '', counted: '', damaged: '', unitWeight: '', condition: '', notes: '' })

export default function InspectionDetail() {
  const { id } = useParams() as { id: string }
  const a = useAuth(), qc = useQueryClient(), toast = useToast()
  const q = useQuery({ queryKey: ['inspection', id], queryFn: () => getInspectionMap(id) })
  const [h, setH] = useState<MapHeader | null>(null), [lines, setLines] = useState<L[]>([]), [err, setErr] = useState<string>(), [confirm, setConfirm] = useState(false), [rev, setRev] = useState<null | 'approved' | 'returned'>(null), [note, setNote] = useState('')
  useEffect(() => {
    if (!q.data) return
    const m = q.data.map
    setH({ title: m.title, vessel_name: m.vessel_name, voyage_ref: m.voyage_ref, bl_ref: m.bl_ref, port_location: m.port_location, cargo_description: m.cargo_description, cargo_owner: m.cargo_owner, inspection_date: m.inspection_date, tolerance_pct: Number(m.tolerance_pct), notes: m.notes })
    setLines(q.data.lines.map((l) => ({ key: l.id, id: l.id, hold_ref: l.hold_ref ?? '', item_description: l.item_description, lot_ref: l.lot_ref ?? '', unit: l.unit, declared: String(Number(l.declared_qty)), counted: String(Number(l.counted_qty)), damaged: String(Number(l.damaged_qty)), unitWeight: l.unit_weight_kg == null ? '' : String(Number(l.unit_weight_kg)), condition: l.condition ?? '', notes: l.notes ?? '' })))
  }, [q.data])
  const calc = useMemo(() => h ? summarizeMap(lines.map((l) => ({ unit: l.unit, declared: num(l.declared), counted: num(l.counted), damaged: num(l.damaged), unitWeight: l.unitWeight === '' ? null : num(l.unitWeight) })), h.tolerance_pct) : null, [lines, h])
  const invalidate = () => { for (const k of ['inspection', 'inspections', 'notifications', 'unread']) qc.invalidateQueries({ queryKey: [k] }) }
  const save = useMutation({
    mutationFn: async () => {
      for (const [i, l] of lines.entries()) { const e = validateInspectionLine({ item_description: l.item_description, declared: num(l.declared), counted: num(l.counted), damaged: num(l.damaged), unitWeight: l.unitWeight === '' ? null : num(l.unitWeight) }); if (e) throw new Error(`Linha ${i + 1}: ${e}`) }
      await updateInspectionHeader(id, h as MapHeader)
      await saveLines(id, lines.map<LineForm>((l, i) => ({ id: l.id, position: i + 1, hold_ref: l.hold_ref, item_description: l.item_description.trim(), lot_ref: l.lot_ref, unit: l.unit, declared_qty: num(l.declared), counted_qty: num(l.counted), damaged_qty: num(l.damaged), unit_weight_kg: l.unitWeight === '' ? null : num(l.unitWeight), condition: l.condition, notes: l.notes })), q.data!.lines.map((x) => x.id))
    },
    onSuccess: () => { setErr(undefined); invalidate() }, onError: (e) => setErr((e as Error).message.startsWith('Linha') ? (e as Error).message : friendlyError(e)),
  })
  const submit = useMutation({ mutationFn: async () => { await save.mutateAsync(); await submitInspectionMap(id) }, onSuccess: () => { toast.success('Mapa submetido para revisão.'); setConfirm(false); invalidate() }, onError: (e) => { setConfirm(false); setErr((e as Error).message.startsWith('Linha') ? (e as Error).message : friendlyError(e)) } })
  const review = useMutation({ mutationFn: () => reviewInspectionMap(id, rev as 'approved' | 'returned', note), onSuccess: () => { toast.success(rev === 'approved' ? 'Mapa aprovado.' : 'Mapa devolvido ao inspector.'); setRev(null); setNote(''); invalidate() }, onError: (e) => toast.error(friendlyError(e)) })
  if (q.isLoading || !h) return q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : <Spinner />
  const m = q.data!.map, me = a.ctx?.profile.id
  const editable = ['draft', 'returned'].includes(m.status) && a.can(P.inspCreate) && (m.created_by === me || m.inspector_id === me || a.can(P.inspReview))
  const isOwn = m.created_by === me || m.inspector_id === me
  const set = (k: number, p: Partial<L>) => setLines(lines.map((l, i) => (i === k ? { ...l, ...p } : l)))
  const setHead = <K extends keyof MapHeader>(k: K, v: MapHeader[K]) => setH({ ...(h as MapHeader), [k]: v })
  return (
    <>
      <PageHeader back={<Link to="/app/inspeccoes" className="kbd-link">← Mapas de inspecção</Link>} title={m.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{m.number}</span><StatusBadge label={INSPECTION_STATUS[m.status]} />{m.submitted_at && <span className="text-ink-mute">submetido em {formatDateTime(m.submitted_at)}</span>}</span>}
        actions={<><Link to={`/app/inspeccoes/${id}/relatorio`} className="btn-secondary"><FileText className="h-4 w-4" aria-hidden />Relatório</Link>{a.can(P.scanView) && <Link to={`/app/smart-hold-scan?mapa=${id}`} className="btn-secondary"><Box className="h-4 w-4" aria-hidden />Digitalizar porão</Link>}</>} />
      {m.status === 'returned' && m.review_note && <div className="mb-4"><Alert tone="warn" title="Devolvido para correcção">{m.review_note}</Alert></div>}
      {m.status === 'approved' && <div className="mb-4"><Alert tone="ok" title="Mapa aprovado">Já não pode ser alterado. {m.review_note}</Alert></div>}
      {err && <div className="mb-4"><Alert tone="danger">{err}</Alert></div>}

      <section className="card card-pad mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-labelledby="h1"><h2 id="h1" className="section-title sm:col-span-2 lg:col-span-3">Identificação</h2>
        <Field label="Título" className="sm:col-span-2">{(i) => <Input id={i} disabled={!editable} value={h.title} onChange={(e) => setHead('title', e.target.value)} />}</Field>
        <Field label="Data da inspecção">{(i) => <Input id={i} type="date" disabled={!editable} value={h.inspection_date} onChange={(e) => setHead('inspection_date', e.target.value)} />}</Field>
        <Field label="Navio">{(i) => <Input id={i} disabled={!editable} value={h.vessel_name ?? ''} onChange={(e) => setHead('vessel_name', e.target.value || null)} />}</Field>
        <Field label="Viagem">{(i) => <Input id={i} disabled={!editable} value={h.voyage_ref ?? ''} onChange={(e) => setHead('voyage_ref', e.target.value || null)} />}</Field>
        <Field label="Conhecimento de embarque (BL)">{(i) => <Input id={i} disabled={!editable} value={h.bl_ref ?? ''} onChange={(e) => setHead('bl_ref', e.target.value || null)} />}</Field>
        <Field label="Porto / local">{(i) => <Input id={i} disabled={!editable} value={h.port_location ?? ''} onChange={(e) => setHead('port_location', e.target.value || null)} />}</Field>
        <Field label="Dono da carga">{(i) => <Input id={i} disabled={!editable} value={h.cargo_owner ?? ''} onChange={(e) => setHead('cargo_owner', e.target.value || null)} />}</Field>
        <Field label="Tolerância de diferença (%)">{(i) => <Input id={i} type="number" inputMode="decimal" step="0.01" min="0" disabled={!editable} value={h.tolerance_pct} onChange={(e) => setHead('tolerance_pct', Number(e.target.value))} />}</Field>
        <Field label="Mercadoria" className="sm:col-span-2 lg:col-span-3">{(i) => <Input id={i} disabled={!editable} value={h.cargo_description ?? ''} onChange={(e) => setHead('cargo_description', e.target.value || null)} />}</Field>
      </section>

      <section aria-labelledby="h2" className="mb-5"><div className="mb-3 flex items-center justify-between"><h2 id="h2" className="section-title">Linhas de mercadoria ({lines.length})</h2>{editable && <Button variant="secondary" onClick={() => setLines([...lines, blank()])}><Plus className="h-4 w-4" aria-hidden />Adicionar linha</Button>}</div>
        {lines.length === 0 && <div className="card card-pad text-center text-ink-soft">Sem linhas. {editable ? 'Use «Adicionar linha» para registar a primeira mercadoria.' : ''}</div>}
        <div className="space-y-3">{lines.map((l, k) => {
          const c = calcInspectionLine({ declared: num(l.declared), counted: num(l.counted), damaged: num(l.damaged), unitWeight: l.unitWeight === '' ? null : num(l.unitWeight) })
          const tol = withinTolerance(c.diffPct, h.tolerance_pct)
          return (
            <article key={l.key} className="card p-4" aria-label={`Linha ${k + 1}`}>
              <div className="mb-3 flex items-center justify-between"><p className="font-display font-semibold text-navy">Linha {k + 1}</p>{editable && <Button variant="ghost" small onClick={() => setLines(lines.filter((_, j) => j !== k))} aria-label={`Remover linha ${k + 1}`}><Trash2 className="h-4 w-4" aria-hidden />Remover</Button>}</div>
              <fieldset disabled={!editable} className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <Field label="Mercadoria" required className="col-span-2 lg:col-span-3">{(i) => <Input id={i} value={l.item_description} onChange={(e) => set(k, { item_description: e.target.value })} />}</Field>
                <Field label="Porão / local" className="col-span-1">{(i) => <Input id={i} value={l.hold_ref} onChange={(e) => set(k, { hold_ref: e.target.value })} />}</Field>
                <Field label="Lote" className="col-span-1">{(i) => <Input id={i} value={l.lot_ref} onChange={(e) => set(k, { lot_ref: e.target.value })} />}</Field>
                <Field label="Unidade">{(i) => <Select id={i} value={l.unit} onChange={(e) => set(k, { unit: e.target.value })}>{INSPECTION_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>}</Field>
                <Field label="Declarada">{(i) => <Input id={i} inputMode="decimal" type="number" min="0" step="any" value={l.declared} onChange={(e) => set(k, { declared: e.target.value })} />}</Field>
                <Field label="Contada">{(i) => <Input id={i} inputMode="decimal" type="number" min="0" step="any" value={l.counted} onChange={(e) => set(k, { counted: e.target.value })} />}</Field>
                <Field label="Avariada">{(i) => <Input id={i} inputMode="decimal" type="number" min="0" step="any" value={l.damaged} onChange={(e) => set(k, { damaged: e.target.value })} />}</Field>
                <Field label="Peso unit. (kg)" className="col-span-1">{(i) => <Input id={i} inputMode="decimal" type="number" min="0" step="any" value={l.unitWeight} onChange={(e) => set(k, { unitWeight: e.target.value })} />}</Field>
                <Field label="Estado / condição" className="col-span-2">{(i) => <Input id={i} value={l.condition} onChange={(e) => set(k, { condition: e.target.value })} placeholder="Ex.: humidade, embalagem rasgada" />}</Field>
                <Field label="Observações" className="col-span-2 lg:col-span-6">{(i) => <Input id={i} value={l.notes} onChange={(e) => set(k, { notes: e.target.value })} />}</Field>
              </fieldset>
              <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-surface p-3 text-[15px] sm:grid-cols-5" aria-label={`Cálculos da linha ${k + 1}`}>
                <div><dt className="text-xs font-bold uppercase text-ink-mute">Diferença</dt><dd className="font-semibold tabular-nums">{formatNumber(c.diff, 3)}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-ink-mute">Diferença %</dt><dd className="font-semibold tabular-nums">{c.diffPct === null ? '—' : `${formatNumber(c.diffPct, 2)} %`}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-ink-mute">Boa</dt><dd className="font-semibold tabular-nums">{formatNumber(c.good, 3)}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-ink-mute">Peso líquido</dt><dd className="font-semibold tabular-nums">{c.weightKg === null ? '—' : `${formatNumber(c.weightKg, 3)} kg`}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-ink-mute">Tolerância</dt><dd>{tol === null ? <Badge>Sem declarada</Badge> : tol ? <Badge tone="ok">Dentro</Badge> : <Badge tone="danger">Fora ({h.tolerance_pct} %)</Badge>}</dd></div>
              </dl>
            </article>) })}</div>
      </section>

      {calc && calc.byUnit.length > 0 && (
        <section className="card card-pad mb-5" aria-labelledby="h3"><h2 id="h3" className="section-title mb-1">Totais por unidade</h2><p className="mb-3 text-sm text-ink-soft">Unidades diferentes nunca são somadas entre si. O peso só soma linhas com peso unitário indicado.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse"><thead><tr>{['Unidade', 'Declarada', 'Contada', 'Avariada', 'Boa', 'Diferença', 'Dif. %', 'Peso líquido', 'Fora tol.'].map((x) => <th key={x} className="th">{x}</th>)}</tr></thead>
            <tbody>{calc.byUnit.map((u) => <tr key={u.unit}><td className="td font-semibold">{u.unit}</td>{[u.declared, u.counted, u.damaged, u.good, u.diff].map((v, i) => <td key={i} className="td tabular-nums">{formatNumber(v, 3)}</td>)}<td className="td tabular-nums">{u.diffPct === null ? '—' : `${formatNumber(u.diffPct, 2)} %`}</td><td className="td tabular-nums">{u.weightKg === null ? '—' : `${formatNumber(u.weightKg, 3)} kg`}{u.linesWithoutWeight > 0 && u.weightKg !== null && <span className="block text-xs text-ink-mute">{u.linesWithoutWeight} linha(s) sem peso</span>}</td><td className="td">{u.outOfTolerance ? <Badge tone="danger">{u.outOfTolerance}</Badge> : <Badge tone="ok">0</Badge>}</td></tr>)}</tbody></table></div>
          {calc.totalWeightKg !== null && <p className="mt-3 font-semibold text-navy">Peso líquido total das linhas com peso: {formatNumber(calc.totalWeightKg, 3)} kg</p>}</section>
      )}

      <section className="card card-pad mb-5"><Field label="Observações gerais">{(i) => <Textarea id={i} disabled={!editable} value={h.notes ?? ''} onChange={(e) => setHead('notes', e.target.value || null)} />}</Field></section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {editable && <><Button variant="secondary" loading={save.isPending && !submit.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => toast.success('Mapa guardado.') })}><Save className="h-4 w-4" aria-hidden />Guardar</Button><Button disabled={!lines.length} onClick={() => setConfirm(true)}><Send className="h-4 w-4" aria-hidden />Submeter para revisão</Button></>}
        {m.status === 'submitted' && a.can(P.inspReview) && (isOwn ? <p className="self-center text-sm text-ink-soft">Não pode aprovar um mapa que preencheu ou submeteu.</p> : <><Button variant="secondary" onClick={() => setRev('returned')}>Devolver</Button><Button onClick={() => setRev('approved')}>Aprovar</Button></>)}
      </div>
      <ConfirmDialog open={confirm} title="Submeter mapa" confirmLabel="Submeter" loading={submit.isPending} onConfirm={() => submit.mutate()} onClose={() => setConfirm(false)} message="Depois de submetido, o mapa só volta a ser editável se for devolvido por um revisor." />
      <Modal open={!!rev} onClose={() => setRev(null)} title={rev === 'approved' ? 'Aprovar mapa' : 'Devolver mapa'} footer={<><Button variant="secondary" onClick={() => setRev(null)}>Cancelar</Button><Button loading={review.isPending} disabled={rev === 'returned' && note.trim().length < 5} onClick={() => review.mutate()}>Confirmar</Button></>}>
        <Field label={rev === 'returned' ? 'Motivo (obrigatório)' : 'Nota (opcional)'}>{(i) => <Textarea id={i} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </Modal>
    </>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, ConfirmDialog, ErrorState, Field, FilePicker, Input, PageHeader, Spinner, Textarea, useToast } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useDocTypes } from '@/hooks/useCatalog'
import { isDocInForce } from '@/lib/domain/documents'
import { friendlyError } from '@/lib/domain/errors'
import { formatDateTime, formatMoney } from '@/lib/domain/format'
import { calcProposal } from '@/lib/domain/proposal'
import { canSubmitProposal, effectiveDeadline } from '@/lib/domain/opportunity'
import { listDocuments } from '@/services/documents'
import { getOpportunityDetail, openAttachment, uploadAttachment } from '@/services/opportunities'
import { getMyProposal, saveProposal } from '@/services/proposals'

interface Line { unit_price: string; discount_pct: string; tax_pct: string }
const num = (s: string) => (s === '' || Number.isNaN(Number(s)) ? 0 : Number(s))

export default function ProposalForm() {
  const { id } = useParams() as { id: string }
  const a = useAuth(), nav = useNavigate(), qc = useQueryClient(), toast = useToast(), types = useDocTypes()
  const orgId = a.activeMembership!.organization_id
  const opp = useQuery({ queryKey: ['opp', id], queryFn: () => getOpportunityDetail(id) })
  const mine = useQuery({ queryKey: ['proposals', 'mine', id, orgId], queryFn: () => getMyProposal(id, orgId) })
  const docs = useQuery({ queryKey: ['docs', orgId], queryFn: () => listDocuments(orgId) })
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [h, setH] = useState({ validity_until: '', delivery_days: '', commercial_terms: '', notes: '' })
  const [err, setErr] = useState<Record<string, string>>({}), [confirm, setConfirm] = useState(false), [file, setFile] = useState<File | null>(null)
  const d = opp.data, p = mine.data
  useEffect(() => {
    if (!d || mine.isLoading) return
    setLines(Object.fromEntries(d.items.map((it) => { const x = p?.items.find((i) => i.opportunity_item_id === it.id); return [it.id, { unit_price: x ? String(x.unit_price) : '', discount_pct: x ? String(x.discount_pct) : '0', tax_pct: x ? String(x.tax_pct) : '14' }] })))
    if (p) setH({ validity_until: p.proposal.validity_until ?? '', delivery_days: p.proposal.delivery_days != null ? String(p.proposal.delivery_days) : '', commercial_terms: p.proposal.commercial_terms ?? '', notes: p.proposal.notes ?? '' })
  }, [d, p, mine.isLoading])
  const calc = useMemo(() => d ? calcProposal(d.items.map((it) => ({ quantity: it.quantity, unitPrice: num(lines[it.id]?.unit_price ?? ''), discountPct: num(lines[it.id]?.discount_pct ?? ''), taxPct: num(lines[it.id]?.tax_pct ?? '') }))) : null, [d, lines])
  const payload = () => ({ validity_until: h.validity_until, delivery_days: Number(h.delivery_days || 0), currency: d!.opportunity.currency, commercial_terms: h.commercial_terms, notes: h.notes, items: d!.items.map((it) => ({ opportunity_item_id: it.id, unit_price: num(lines[it.id].unit_price), discount_pct: num(lines[it.id].discount_pct), tax_pct: num(lines[it.id].tax_pct) })) })
  const save = useMutation({
    mutationFn: ({ submit }: { submit: boolean }) => saveProposal(orgId, id, payload(), submit),
    onSuccess: async (pid, v) => {
      if (file) { try { await uploadAttachment(orgId, 'proposal', pid, file) } catch (e) { toast.error('Proposta guardada, mas o anexo falhou: ' + friendlyError(e)) } }
      toast.success(v.submit ? 'Proposta submetida. Recepção confirmada.' : 'Rascunho guardado.')
      for (const k of ['proposals', 'opp', 'opps', 'unread']) qc.invalidateQueries({ queryKey: [k] })
      setConfirm(false); nav(v.submit ? '/app/propostas' : `/app/pedidos/${id}`)
    },
    onError: (e) => { setConfirm(false); setErr({ form: friendlyError(e) }) },
  })
  if (opp.isLoading || mine.isLoading) return <Spinner />
  if (opp.isError || !d) return <ErrorState error={opp.error} retry={() => opp.refetch()} />
  const o = d.opportunity
  const eff = effectiveDeadline(o, d.extensions, orgId)
  const gate = canSubmitProposal(o.status, eff)
  const submittedBefore = p && ['submitted', 'in_evaluation'].includes(p.proposal.status)
  const missingDocs = o.required_document_type_ids.filter((t) => !(docs.data ?? []).some((x) => x.document_type_id === t && isDocInForce(x)))
  const validate = () => {
    const e: Record<string, string> = {}
    if (!h.validity_until || h.validity_until < new Date().toISOString().slice(0, 10)) e.validity = 'Indique uma validade futura'
    if (h.delivery_days === '' || Number(h.delivery_days) < 0) e.delivery = 'Indique o prazo de entrega em dias'
    if (d.items.some((it) => lines[it.id]?.unit_price === '')) e.items = 'Preencha o preço unitário de todos os itens'
    setErr(e); return !Object.keys(e).length
  }
  const set = (itemId: string, k: keyof Line, v: string) => setLines({ ...lines, [itemId]: { ...lines[itemId], [k]: v } })
  if (!gate.ok) return <><PageHeader back={<Link to={`/app/pedidos/${id}`} className="kbd-link">← Voltar ao pedido</Link>} title="Proposta" /><Alert tone="warn" title="Não é possível submeter proposta">{gate.reason}</Alert></>
  return (
    <>
      <PageHeader back={<Link to={`/app/pedidos/${id}`} className="kbd-link">← {o.number}</Link>} title={submittedBefore ? 'Rever proposta' : 'Preparar proposta'} subtitle={<span>{o.title} · prazo <strong>{formatDateTime(eff.toISOString())}</strong> · moeda <strong>{o.currency}</strong></span>} actions={p && <Badge tone="info">Versão {p.proposal.current_version || 0}</Badge>} />
      {submittedBefore && <div className="mb-4"><Alert tone="info" title="Já submeteu esta proposta">Pode submeter uma nova versão até ao fim do prazo. A versão anterior fica guardada no histórico.</Alert></div>}
      {missingDocs.length > 0 && <div className="mb-4"><Alert tone="warn" title="Faltam documentos exigidos pelo pedido">{missingDocs.map((t) => types.data?.find((x) => x.id === t)?.name).join(', ')}. Só poderá submeter quando estiverem aprovados e em vigor — <Link to="/app/documentos" className="kbd-link">ir para Documentos</Link>.</Alert></div>}
      {err.form && <div className="mb-4"><Alert tone="danger">{err.form}</Alert></div>}
      <div className="space-y-6">
        <section className="card overflow-x-auto" aria-labelledby="pi"><h2 id="pi" className="section-title px-5 pt-5">Preços por item</h2>
          {err.items && <p role="alert" className="field-error px-5">{err.items}</p>}
          <table className="mt-3 w-full min-w-[820px] border-collapse"><thead><tr><th className="th">Item</th><th className="th text-right">Qtd.</th><th className="th">Preço unit. ({o.currency})</th><th className="th">Desc. %</th><th className="th">Imposto %</th><th className="th text-right">Total da linha</th></tr></thead>
            <tbody>{d.items.map((it, i) => { const l = lines[it.id]; const r = calc?.lines[i]; return (
              <tr key={it.id}><td className="td">{it.description}{it.technical_spec && <p className="text-xs text-ink-mute">{it.technical_spec}</p>}</td><td className="td text-right tabular-nums">{Number(it.quantity)} {it.unit}</td>
                <td className="td"><Input aria-label={`Preço unitário do item ${i + 1}`} className="w-36" type="number" min="0" step="0.01" value={l?.unit_price ?? ''} onChange={(e) => set(it.id, 'unit_price', e.target.value)} /></td>
                <td className="td"><Input aria-label={`Desconto do item ${i + 1}`} className="w-20" type="number" min="0" max="100" step="0.01" value={l?.discount_pct ?? ''} onChange={(e) => set(it.id, 'discount_pct', e.target.value)} /></td>
                <td className="td"><Input aria-label={`Imposto do item ${i + 1}`} className="w-20" type="number" min="0" max="100" step="0.01" value={l?.tax_pct ?? ''} onChange={(e) => set(it.id, 'tax_pct', e.target.value)} /></td>
                <td className="td text-right font-semibold tabular-nums">{formatMoney(r?.total ?? 0, o.currency)}</td></tr>) })}</tbody></table>
          <dl className="ml-auto max-w-xs space-y-1 px-5 py-4 text-[15px]" aria-label="Totais">
            {[['Subtotal (bruto)', calc?.subtotal], ['Descontos', -(calc?.discountTotal ?? 0)], ['Impostos', calc?.taxTotal]].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt className="text-ink-soft">{k}</dt><dd className="tabular-nums">{formatMoney(v as number, o.currency)}</dd></div>)}
            <div className="flex justify-between border-t border-line pt-2 font-display text-lg font-bold text-navy"><dt>Total</dt><dd className="tabular-nums">{formatMoney(calc?.total ?? 0, o.currency)}</dd></div>
            <p className="pt-1 text-xs text-ink-mute">O servidor recalcula estes valores ao submeter; prevalece o cálculo do servidor.</p></dl>
        </section>
        <section className="card card-pad grid gap-4 sm:grid-cols-2" aria-labelledby="pc"><h2 id="pc" className="section-title sm:col-span-2">Condições</h2>
          <Field label="Validade da proposta" error={err.validity} required>{(i, dd) => <Input id={i} type="date" aria-describedby={dd} value={h.validity_until} onChange={(e) => setH({ ...h, validity_until: e.target.value })} />}</Field>
          <Field label="Prazo de entrega (dias)" error={err.delivery} required>{(i, dd) => <Input id={i} type="number" min="0" aria-describedby={dd} value={h.delivery_days} onChange={(e) => setH({ ...h, delivery_days: e.target.value })} />}</Field>
          <Field label="Condições comerciais" className="sm:col-span-2">{(i) => <Textarea id={i} value={h.commercial_terms} onChange={(e) => setH({ ...h, commercial_terms: e.target.value })} />}</Field>
          <Field label="Notas para o comprador" className="sm:col-span-2">{(i) => <Textarea id={i} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />}</Field>
          <div className="sm:col-span-2"><p className="label">Anexo (opcional)</p>{p?.attachments.map((x) => <p key={x.id} className="mb-2 text-sm"><button className="kbd-link" onClick={() => openAttachment(x)}>{x.file_name}</button></p>)}<FilePicker file={file} onChange={setFile} accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" hint="Proposta técnica, catálogo… até 20 MB" />{!p && file && <p className="hint">O anexo é carregado depois de guardar a proposta.</p>}</div>
        </section>
        <div className="flex flex-wrap justify-end gap-2">
          {!submittedBefore && <Button variant="secondary" loading={save.isPending && !confirm} onClick={() => { setErr({}); save.mutate({ submit: false }) }}>Guardar rascunho</Button>}
          <Button disabled={missingDocs.length > 0} onClick={() => validate() && setConfirm(true)}>{submittedBefore ? 'Submeter nova versão' : 'Submeter proposta'}</Button>
        </div>
      </div>
      <ConfirmDialog open={confirm} title="Confirmar submissão" confirmLabel="Submeter agora" loading={save.isPending} onConfirm={() => save.mutate({ submit: true })} onClose={() => setConfirm(false)}
        message={<>Vai submeter {submittedBefore ? 'uma nova versão d' : ''}a proposta no valor de <strong>{formatMoney(calc?.total ?? 0, o.currency)}</strong>. Receberá uma confirmação de recepção com a hora registada.</>} />
    </>
  )
}

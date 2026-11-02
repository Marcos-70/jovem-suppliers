import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, CalendarPlus, FileText, Lock, Paperclip, Pencil, Send, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { OpenFileButton } from '@/components/DocumentParts'
import { Alert, Badge, Button, DataTable, DescriptionList, EmptyState, ErrorState, Field, FilePicker, Input, Modal, PageHeader, Select, Spinner, StatusBadge, TabPanel, Tabs, Textarea, useToast, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useCategories, useDocTypes } from '@/hooks/useCatalog'
import { useOrgNames } from '@/hooks/useOrgNames'
import { friendlyError } from '@/lib/domain/errors'
import { evaluationMatrix } from '@/lib/domain/evaluation'
import { formatDateTime, formatMoney, formatDate } from '@/lib/domain/format'
import { OPP_STATUS, PROPOSAL_STATUS } from '@/lib/domain/labels'
import { allowedTransitions, canSubmitProposal, deadlineState, effectiveDeadline, finalDeadline, timeLeft } from '@/lib/domain/opportunity'
import { P } from '@/lib/domain/permissions'
import type { OpportunityStatus, Proposal } from '@/lib/domain/types'
import { listAudit } from '@/services/audit'
import { listDocuments } from '@/services/documents'
import { listEligibleSuppliers } from '@/services/organizations'
import * as svc from '@/services/opportunities'
import { getMyProposal } from '@/services/proposals'

type Tab = 'resumo' | 'convites' | 'propostas' | 'esclarecimentos' | 'historico'

function useAct<V = void>(fn: (v: V) => Promise<unknown>, ok: string, after?: () => void) {
  const qc = useQueryClient(), toast = useToast()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { toast.success(ok); for (const k of ['opp', 'opps', 'oppProposals', 'proposals', 'unread']) qc.invalidateQueries({ queryKey: [k] }); after?.() },
    onError: (e) => toast.error(friendlyError(e)),
  })
}

const STATUS_VERB: Partial<Record<OpportunityStatus, string>> = {
  under_evaluation: 'Passar para avaliação', clarification: 'Abrir fase de esclarecimento', open: 'Reabrir para propostas',
  closed: 'Encerrar pedido', cancelled: 'Cancelar pedido', archived: 'Arquivar',
}

export default function OpportunityDetail() {
  const { id } = useParams() as { id: string }
  const a = useAuth(), orgs = useOrgNames()
  const [tab, setTab] = useState<Tab>('resumo')
  const q = useQuery({ queryKey: ['opp', id], queryFn: () => svc.getOpportunityDetail(id) })
  const myOrg = a.activeMembership?.organization_id
  const d = q.data
  const isBuyer = !!d && d.opportunity.buyer_org_id === myOrg
  // O convite fica marcado como visto quando o fornecedor abre o pedido.
  useEffect(() => { if (d && !isBuyer && myOrg) svc.markViewed(id, myOrg) }, [d, isBuyer, myOrg, id])
  if (q.isLoading) return <Spinner />
  if (q.isError || !d) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const o = d.opportunity
  const fd = finalDeadline(o, d.extensions)
  const canManage = isBuyer && a.can(P.oppManage)
  const nextStates = allowedTransitions(o.status).filter((s) => !['published', 'invites_sent'].includes(s))
  return (
    <>
      <PageHeader back={<Link to="/app/pedidos" className="kbd-link">← Pedidos de cotação</Link>} title={o.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{o.number}</span><StatusBadge label={OPP_STATUS[o.status]} />{['open', 'clarification'].includes(o.status) && <Badge tone={deadlineState(fd) === 'passed' ? 'danger' : deadlineState(fd) === 'closing_soon' ? 'warn' : 'neutral'}>{timeLeft(fd)}</Badge>}<span className="text-ink-mute">· {orgs.name(o.buyer_org_id)}</span></span>}
        actions={canManage && <BuyerActions id={id} status={o.status} nextStates={nextStates} deadline={fd} detail={d} />} />
      <Tabs label="Secções do pedido" value={tab} onChange={setTab} tabs={[
        { id: 'resumo', label: 'Resumo' },
        ...(isBuyer ? [{ id: 'convites' as Tab, label: 'Convites', count: d.invitations.length }] : []),
        ...(isBuyer && a.can(P.propView) ? [{ id: 'propostas' as Tab, label: 'Propostas e decisão' }] : []),
        { id: 'esclarecimentos', label: 'Esclarecimentos', count: d.clarifications.length + d.notices.length },
        ...(a.can(P.auditView) ? [{ id: 'historico' as Tab, label: 'Histórico' }] : []),
      ]} />
      <TabPanel id="resumo" active={tab === 'resumo'}><Summary d={d} isBuyer={isBuyer} fd={fd} /></TabPanel>
      <TabPanel id="convites" active={tab === 'convites'}><Invites d={d} canManage={canManage} /></TabPanel>
      <TabPanel id="propostas" active={tab === 'propostas'}><ProposalsTab d={d} fd={fd} /></TabPanel>
      <TabPanel id="esclarecimentos" active={tab === 'esclarecimentos'}><Clarifications d={d} isBuyer={isBuyer} canManage={canManage} fd={fd} /></TabPanel>
      <TabPanel id="historico" active={tab === 'historico'}><History id={id} /></TabPanel>
    </>
  )
}

/* ------------------------------------------------------------ Resumo */
function Summary({ d, isBuyer, fd }: { d: svc.OpportunityDetail; isBuyer: boolean; fd: Date }) {
  const a = useAuth(), cats = useCategories(), types = useDocTypes(), toast = useToast(), qc = useQueryClient()
  const o = d.opportunity
  const myOrg = a.activeMembership?.organization_id
  const mine = useQuery({ queryKey: ['proposals', 'mine', o.id, myOrg], queryFn: () => getMyProposal(o.id, myOrg as string), enabled: !isBuyer && !!myOrg && a.isSupplierOrg && a.can(P.propView) })
  const [file, setFile] = useState<File | null>(null)
  const up = useAct(async () => { await svc.uploadAttachment(o.buyer_org_id, 'opportunity', o.id, file as File); setFile(null) }, 'Anexo carregado.')
  const eff = !isBuyer && myOrg ? effectiveDeadline(o, d.extensions, myOrg) : fd
  const can = canSubmitProposal(o.status, eff)
  const p = mine.data?.proposal
  const itemCols: Column<(typeof d.items)[number]>[] = [
    { key: 'p', header: '#', cell: (i) => i.position }, { key: 'd', header: 'Descrição', cell: (i) => <div>{i.description}{i.technical_spec && <p className="text-xs text-ink-mute">{i.technical_spec}</p>}</div> },
    { key: 'q', header: 'Quantidade', cell: (i) => Number(i.quantity).toLocaleString('pt-PT'), align: 'right' }, { key: 'u', header: 'Unidade', cell: (i) => i.unit },
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {!isBuyer && a.isSupplierOrg && (
          <div className="card card-pad">
            <h2 className="section-title mb-2">A sua proposta</h2>
            {p && p.status !== 'draft' ? (
              <div className="space-y-2"><p className="flex flex-wrap items-center gap-2"><StatusBadge label={PROPOSAL_STATUS[p.status]} /><span className="font-semibold">{formatMoney(p.total, p.currency)}</span><span className="text-sm text-ink-mute">versão {p.current_version} · {p.receipt_code}</span></p>
                {can.ok && <Link to={`/app/pedidos/${o.id}/proposta`} className="btn-secondary">Rever / submeter nova versão</Link>}</div>
            ) : can.ok && a.can(P.propSubmit) ? <div><p className="mb-3 text-ink-soft">{p ? 'Tem um rascunho guardado.' : 'Ainda não submeteu proposta.'} Prazo: <strong>{formatDateTime(eff.toISOString())}</strong>.</p><Link to={`/app/pedidos/${o.id}/proposta`} className="btn-primary"><Send className="h-4 w-4" aria-hidden />{p ? 'Continuar proposta' : 'Preparar proposta'}</Link></div>
              : <Alert tone="neutral">{can.reason ?? 'Não tem permissão para submeter propostas.'}</Alert>}
          </div>
        )}
        <div className="card card-pad"><h2 className="section-title mb-3">Detalhes</h2>
          <DescriptionList items={[
            { label: 'Categoria', value: cats.data?.find((c) => c.id === o.category_id)?.name }, { label: 'Local de entrega', value: o.delivery_location },
            { label: 'Prazo final', value: formatDateTime(fd.toISOString()) }, { label: 'Moeda', value: o.currency },
            { label: 'Acesso', value: o.visibility === 'invited_only' ? 'Só fornecedores convidados' : 'Fornecedores aprovados da categoria' }, { label: 'Propostas seladas', value: o.sealed_until_deadline ? 'Sim, até ao fim do prazo' : 'Não' },
          ]} />
          {o.description && <div className="mt-4"><h3 className="label">Descrição</h3><p className="whitespace-pre-line text-[15px]">{o.description}</p></div>}
          {o.technical_requirements && <div className="mt-4"><h3 className="label">Requisitos técnicos</h3><p className="whitespace-pre-line text-[15px]">{o.technical_requirements}</p></div>}
          {o.commercial_terms && <div className="mt-4"><h3 className="label">Condições comerciais</h3><p className="whitespace-pre-line text-[15px]">{o.commercial_terms}</p></div>}
          {o.required_document_type_ids.length > 0 && <div className="mt-4"><h3 className="label">Documentos exigidos</h3><p className="flex flex-wrap gap-1.5">{o.required_document_type_ids.map((t) => <Badge key={t}>{types.data?.find((x) => x.id === t)?.name ?? '—'}</Badge>)}</p></div>}
        </div>
        <div><h2 className="section-title mb-2">Itens</h2><DataTable rows={d.items} columns={itemCols} rowKey={(i) => i.id} caption="Itens do pedido" pageSize={20} /></div>
        {d.criteria.length > 0 && <div className="card card-pad"><h2 className="section-title mb-2">Critérios de avaliação</h2><ul className="divide-y divide-line">{d.criteria.map((c) => <li key={c.id} className="flex items-center justify-between py-2"><span>{c.name} <span className="text-xs text-ink-mute">({c.kind === 'technical' ? 'técnico' : 'comercial'})</span></span><span className="font-bold text-navy">{Number(c.weight)}%</span></li>)}</ul></div>}
      </div>
      <aside className="space-y-6">
        {d.decision && isBuyer && <div className="card card-pad border-ok/40"><h2 className="section-title mb-2 flex items-center gap-2"><Award className="h-5 w-5 text-ok" aria-hidden />Decisão comercial</h2><p className="font-semibold">{d.decision.result === 'awarded' ? 'Adjudicado' : 'Sem adjudicação'}{d.decision.approved_amount != null && ` — ${formatMoney(d.decision.approved_amount, d.decision.currency ?? o.currency)}`}</p><p className="mt-1 text-sm text-ink-soft">{d.decision.rationale}</p><p className="mt-2 text-xs text-ink-mute">{formatDateTime(d.decision.decided_at)} · não constitui contrato</p></div>}
        <div className="card card-pad">
          <h2 className="section-title mb-2">Anexos</h2>
          {d.attachments.length === 0 ? <p className="text-sm text-ink-soft">Sem anexos.</p> : <ul className="space-y-2">{d.attachments.map((x) => <li key={x.id} className="flex items-center justify-between gap-2 text-[15px]"><span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden /><span className="truncate">{x.file_name}</span></span><Button variant="secondary" small onClick={() => svc.openAttachment(x).catch((e) => toast.error(friendlyError(e)))}>Abrir</Button></li>)}</ul>}
          {isBuyer && a.can(P.oppManage) && ['draft', 'published', 'invites_sent', 'open', 'clarification'].includes(o.status) && (
            <div className="mt-3 space-y-2"><FilePicker file={file} onChange={setFile} accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" hint="PDF, imagem, Word ou Excel — até 20 MB" /><Button small loading={up.isPending} disabled={!file} onClick={() => up.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: ['opp', o.id] }) })}>Carregar anexo</Button></div>)}
        </div>
        {d.extensions.length > 0 && <div className="card card-pad"><h2 className="section-title mb-2">Prorrogações de prazo</h2><ul className="space-y-2 text-sm">{d.extensions.map((e) => <li key={e.id}><p className="font-semibold">{formatDateTime(e.previous_deadline)} → {formatDateTime(e.new_deadline)}{e.supplier_org_id ? ' (fornecedor específico)' : ''}</p><p className="text-ink-soft">{e.reason}</p></li>)}</ul></div>}
      </aside>
    </div>
  )
}

/* ------------------------------------------------- Acções do comprador */
function BuyerActions({ id, status, nextStates, deadline, detail }: { id: string; status: OpportunityStatus; nextStates: OpportunityStatus[]; deadline: Date; detail: svc.OpportunityDetail }) {
  const [m, setM] = useState<'publish' | 'extend' | 'status' | 'invite' | null>(null)
  const [reason, setReason] = useState(''), [to, setTo] = useState<OpportunityStatus | ''>(''), [when, setWhen] = useState(''), [only, setOnly] = useState(''), [sel, setSel] = useState<string[]>([]), [openNow, setOpenNow] = useState(true)
  const suppliers = useQuery({ queryKey: ['eligible'], queryFn: listEligibleSuppliers, enabled: m === 'publish' || m === 'invite' })
  const close = () => { setM(null); setReason(''); setTo(''); setWhen(''); setOnly(''); setSel([]) }
  const publish = useAct(() => svc.publishOpportunity(id, sel, openNow), 'Pedido publicado.', close)
  const invite = useAct(() => svc.inviteSuppliers(id, sel), 'Convites enviados.', close)
  const extend = useAct(() => svc.extendDeadline(id, when, reason, only || undefined), 'Prazo prorrogado.', close)
  const change = useAct(() => svc.setOpportunityStatus(id, to as string, reason || undefined), 'Estado actualizado.', close)
  const invitedIds = new Set(detail.invitations.map((i) => i.supplier_org_id))
  const pickable = (suppliers.data ?? []).filter((s) => m === 'publish' || !invitedIds.has(s.id))
  const toggle = (sid: string) => setSel((s) => (s.includes(sid) ? s.filter((x) => x !== sid) : [...s, sid]))
  const SupplierPicker = (
    <fieldset><legend className="label">Fornecedores</legend>
      {suppliers.isLoading ? <Spinner /> : pickable.length === 0 ? <p className="text-ink-soft">Não há fornecedores elegíveis (aprovados) por convidar.</p> : <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">{pickable.map((s) => <li key={s.id}><label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 hover:bg-surface"><input type="checkbox" className="h-[18px] w-[18px] accent-brand-700" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} /><span className="text-[15px]">{s.trade_name || s.legal_name}<span className="ml-1 text-xs text-ink-mute">{s.province}</span></span></label></li>)}</ul>}
    </fieldset>
  )
  return (
    <>
      {status === 'draft' && <><Link to={`/app/pedidos/${id}/editar`} className="btn-secondary"><Pencil className="h-4 w-4" aria-hidden />Editar</Link><Button onClick={() => setM('publish')}><Send className="h-4 w-4" aria-hidden />Publicar</Button></>}
      {['published', 'invites_sent', 'open', 'clarification'].includes(status) && <Link to={`/app/pedidos/${id}/editar`} className="btn-secondary"><Pencil className="h-4 w-4" aria-hidden />Editar textos</Link>}
      {['published', 'invites_sent', 'open', 'clarification'].includes(status) && <Button variant="secondary" onClick={() => setM('invite')}><UserPlus className="h-4 w-4" aria-hidden />Convidar</Button>}
      {['published', 'invites_sent', 'open', 'clarification', 'under_evaluation', 'closed'].includes(status) && <Button variant="secondary" onClick={() => setM('extend')}><CalendarPlus className="h-4 w-4" aria-hidden />Prorrogar prazo</Button>}
      {nextStates.length > 0 && <Button variant="secondary" onClick={() => setM('status')}>Alterar estado</Button>}

      <Modal open={m === 'publish'} onClose={close} title="Publicar pedido" footer={<><Button variant="secondary" onClick={close}>Cancelar</Button><Button loading={publish.isPending} onClick={() => publish.mutate()}>Publicar</Button></>}>
        <div className="space-y-4"><Alert tone="info">Depois de publicado, itens e critérios ficam bloqueados e os convidados são notificados.</Alert>
          {detail.opportunity.visibility === 'invited_only' ? SupplierPicker : <p className="text-[15px]">Este pedido é aberto a fornecedores aprovados com serviços da categoria; pode também convidar fornecedores específicos.</p>}
          {detail.opportunity.visibility !== 'invited_only' && SupplierPicker}
          <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-[18px] w-[18px] accent-brand-700" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} />Abrir imediatamente para propostas</label></div>
      </Modal>
      <Modal open={m === 'invite'} onClose={close} title="Convidar fornecedores" footer={<><Button variant="secondary" onClick={close}>Cancelar</Button><Button loading={invite.isPending} disabled={!sel.length} onClick={() => invite.mutate()}>Enviar convites</Button></>}>{SupplierPicker}</Modal>
      <Modal open={m === 'extend'} onClose={close} title="Prorrogar prazo" footer={<><Button variant="secondary" onClick={close}>Cancelar</Button><Button loading={extend.isPending} disabled={!when || reason.trim().length < 5} onClick={() => extend.mutate()}>Prorrogar</Button></>}>
        <div className="space-y-4"><p className="text-sm text-ink-soft">Prazo final actual: <strong>{formatDateTime(deadline.toISOString())}</strong>. A prorrogação fica registada, é comunicada e, se o pedido já estiver encerrado ou em avaliação, reabre-o para propostas.</p>
          <Field label="Novo prazo" required>{(i) => <Input id={i} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
          <Field label="Aplicar a">{(i) => <Select id={i} value={only} onChange={(e) => setOnly(e.target.value)}><option value="">Todos os fornecedores</option>{detail.invitations.map((v) => <SupplierOption key={v.id} id={v.supplier_org_id} />)}</Select>}</Field>
          <Field label="Motivo (obrigatório)" required>{(i) => <Textarea id={i} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field></div>
      </Modal>
      <Modal open={m === 'status'} onClose={close} title="Alterar estado do pedido" footer={<><Button variant="secondary" onClick={close}>Cancelar</Button><Button variant={to === 'cancelled' ? 'danger' : 'primary'} loading={change.isPending} disabled={!to} onClick={() => change.mutate()}>Confirmar</Button></>}>
        <div className="space-y-4"><Field label="Nova situação">{(i) => <Select id={i} value={to} onChange={(e) => setTo(e.target.value as OpportunityStatus)}><option value="">Seleccione…</option>{nextStates.map((s) => <option key={s} value={s}>{STATUS_VERB[s] ?? OPP_STATUS[s].text}</option>)}</Select>}</Field>
          {(to === 'cancelled' || (to === 'under_evaluation' && deadline.getTime() > Date.now())) && <Field label={to === 'cancelled' ? 'Motivo do cancelamento (obrigatório)' : 'O prazo ainda não terminou — motivo para avaliar antecipadamente'} required>{(i) => <Textarea id={i} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
          {to === 'cancelled' && <Alert tone="danger">Os fornecedores convidados serão notificados. O pedido e o histórico mantêm-se registados.</Alert>}</div>
      </Modal>
    </>
  )
}
function SupplierOption({ id }: { id: string }) { const o = useOrgNames(); return <option value={id}>{o.name(id)}</option> }

/* ----------------------------------------------------------- Convites */
function Invites({ d, canManage }: { d: svc.OpportunityDetail; canManage: boolean }) {
  const orgs = useOrgNames()
  const labels = { sent: { text: 'Enviado', tone: 'neutral' }, viewed: { text: 'Visto', tone: 'info' }, declined: { text: 'Recusado', tone: 'danger' }, responded: { text: 'Respondeu', tone: 'ok' } } as const
  const cols: Column<(typeof d.invitations)[number]>[] = [
    { key: 'f', header: 'Fornecedor', cell: (i) => <Link className="kbd-link" to={`/app/fornecedores/${i.supplier_org_id}`}>{orgs.name(i.supplier_org_id)}</Link> },
    { key: 's', header: 'Estado', cell: (i) => <StatusBadge label={labels[i.status]} /> }, { key: 'e', header: 'Enviado', cell: (i) => formatDateTime(i.invited_at) },
    { key: 'v', header: 'Visto', cell: (i) => formatDateTime(i.viewed_at) }, { key: 'r', header: 'Respondeu', cell: (i) => formatDateTime(i.responded_at) },
  ]
  return <div><DataTable rows={d.invitations} columns={cols} rowKey={(i) => i.id} caption="Convites enviados" empty={<EmptyState title="Sem convites">{canManage ? 'Use «Convidar» para adicionar fornecedores.' : 'Este pedido não tem convites registados.'}</EmptyState>} /><p className="hint mt-2">O estado «Respondeu» indica que há proposta submetida; o conteúdo só é visível depois do prazo, se o pedido for selado.</p></div>
}

/* --------------------------------------------------- Propostas e decisão */
function ProposalsTab({ d, fd }: { d: svc.OpportunityDetail; fd: Date }) {
  const a = useAuth(), orgs = useOrgNames()
  const o = d.opportunity
  const sealed = o.sealed_until_deadline && Date.now() < fd.getTime()
  const q = useQuery({ queryKey: ['oppProposals', o.id], queryFn: () => svc.getProposalsForOpportunity(o.id), enabled: !sealed })
  const [evalFor, setEvalFor] = useState<Proposal | null>(null), [docsFor, setDocsFor] = useState<Proposal | null>(null), [decide, setDecide] = useState(false)
  const matrix = useMemo(() => evaluationMatrix((q.data?.proposals ?? []).map((p) => p.id), d.criteria, q.data?.evaluations ?? []), [q.data, d.criteria])
  if (sealed) return (
    <div className="card"><EmptyState icon={<Lock />} title="Propostas seladas">O conteúdo das propostas só fica visível depois de {formatDateTime(fd.toISOString())}. Já responderam {d.invitations.filter((i) => i.status === 'responded').length} de {d.invitations.length} convidados.</EmptyState></div>
  )
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const { proposals, items, evaluations } = q.data!
  const valid = proposals.filter((p) => ['submitted', 'in_evaluation', 'selected'].includes(p.status))
  const min = valid.length ? Math.min(...valid.map((p) => Number(p.total))) : 0
  const evalOpen = ['under_evaluation', 'clarification', 'closed'].includes(o.status) && !d.decision
  const canEval = a.can(P.propEvaluate) && evalOpen && d.criteria.length > 0
  const canDecide = a.can(P.oppDecide) && ['under_evaluation', 'closed'].includes(o.status) && !d.decision
  const cols: Column<Proposal>[] = [
    { key: 'f', header: 'Fornecedor', cell: (p) => <div><Link to={`/app/fornecedores/${p.supplier_org_id}`} className="kbd-link">{orgs.name(p.supplier_org_id)}</Link><p className="text-xs text-ink-mute">{p.number} · v{p.current_version}</p></div> },
    { key: 't', header: 'Total', align: 'right', sort: (x, y) => Number(x.total) - Number(y.total), cell: (p) => <div className="font-semibold text-navy">{formatMoney(p.total, p.currency)}{Number(p.total) === min && valid.length > 1 && <p><Badge tone="ok">Mais baixo</Badge></p>}</div> },
    { key: 'e', header: 'Entrega', align: 'right', cell: (p) => (p.delivery_days != null ? `${p.delivery_days} dias` : '—') }, { key: 'v', header: 'Validade', cell: (p) => formatDate(p.validity_until) },
    { key: 's', header: 'Estado', cell: (p) => <StatusBadge label={PROPOSAL_STATUS[p.status]} /> },
    ...(d.criteria.length ? [{ key: 'n', header: 'Nota ponderada', align: 'right' as const, cell: (p: Proposal) => { const r = matrix.find((x) => x.proposalId === p.id); return r?.weighted != null ? <span className="font-bold">{r.weighted.toFixed(2)}</span> : <span className="text-xs text-ink-mute">{r ? `faltam ${r.missing} critério(s)` : '—'}</span> } }] : []),
    { key: 'a', header: 'Acções', cell: (p) => <div className="flex flex-wrap gap-1.5">{a.can(P.docView) && <Button variant="secondary" small onClick={() => setDocsFor(p)}><FileText className="h-4 w-4" aria-hidden />Documentos</Button>}{canEval && ['submitted', 'in_evaluation'].includes(p.status) && <Button variant="secondary" small onClick={() => setEvalFor(p)}>Avaliar</Button>}</div> },
  ]
  return (
    <div className="space-y-6">
      {d.decision && <Alert tone="ok" title={d.decision.result === 'awarded' ? 'Pedido adjudicado' : 'Pedido encerrado sem adjudicação'}>{d.decision.rationale}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">A comparação mostra valores e prazos na moeda do pedido ({o.currency}). A nota ponderada, quando existe, é apenas apoio — a decisão é sua.</p>
        {canDecide && <Button onClick={() => setDecide(true)}><Award className="h-4 w-4" aria-hidden />Registar decisão</Button>}
      </div>
      <DataTable rows={proposals} columns={cols} rowKey={(p) => p.id} caption="Propostas recebidas" empty={<EmptyState title="Sem propostas">Ainda não foram submetidas propostas válidas.</EmptyState>} />
      {valid.length > 1 && (
        <section className="card card-pad overflow-x-auto" aria-labelledby="cmp-i"><h2 id="cmp-i" className="section-title mb-3">Comparação por item (preço unitário e total da linha)</h2>
          <table className="w-full min-w-[560px] border-collapse text-[15px]"><thead><tr><th className="th">Item</th>{valid.map((p) => <th key={p.id} className="th text-right">{orgs.name(p.supplier_org_id)}</th>)}</tr></thead>
            <tbody>{d.items.map((it) => { const row = valid.map((p) => items.find((x) => x.proposal_id === p.id && x.opportunity_item_id === it.id)); const lo = Math.min(...row.map((r) => (r ? Number(r.line_total) : Infinity)))
              return <tr key={it.id}><td className="td">{it.description}<p className="text-xs text-ink-mute">{Number(it.quantity)} {it.unit}</p></td>{row.map((r, i) => <td key={i} className={`td text-right tabular-nums ${r && Number(r.line_total) === lo ? 'font-bold text-ok' : ''}`}>{r ? <>{formatMoney(r.unit_price, o.currency)}<p className="text-xs text-ink-mute">{formatMoney(r.line_total, o.currency)}</p></> : '—'}</td>)}</tr> })}</tbody></table>
        </section>
      )}
      {d.criteria.length > 0 && proposals.length > 0 && (
        <section className="card card-pad overflow-x-auto" aria-labelledby="mx-h"><h2 id="mx-h" className="section-title mb-1">Matriz de avaliação</h2><p className="mb-3 text-sm text-ink-soft">Notas de 0 a 10 (média dos avaliadores). Nota ponderada = Σ(peso × nota) ÷ Σ pesos. Critérios sem nota impedem o cálculo — nunca se assume zero.</p>
          <table className="w-full min-w-[560px] border-collapse text-[15px]"><thead><tr><th className="th">Critério (peso)</th>{proposals.map((p) => <th key={p.id} className="th text-right">{orgs.name(p.supplier_org_id)}</th>)}</tr></thead>
            <tbody>{d.criteria.map((c) => <tr key={c.id}><td className="td">{c.name} <span className="text-xs text-ink-mute">({Number(c.weight)}%)</span></td>{proposals.map((p) => { const v = matrix.find((m) => m.proposalId === p.id)?.perCriterion[c.id]; return <td key={p.id} className="td text-right tabular-nums">{v == null ? '—' : v.toFixed(1)}</td> })}</tr>)}
              <tr className="bg-surface font-bold"><td className="td">Nota ponderada</td>{proposals.map((p) => { const w = matrix.find((m) => m.proposalId === p.id)?.weighted; return <td key={p.id} className="td text-right tabular-nums">{w == null ? '—' : w.toFixed(2)}</td> })}</tr></tbody></table>
        </section>
      )}
      <EvaluateModal proposal={evalFor} criteria={d.criteria} evaluations={evaluations} onClose={() => setEvalFor(null)} />
      <SupplierDocsModal proposal={docsFor} onClose={() => setDocsFor(null)} />
      <DecisionModal open={decide} onClose={() => setDecide(false)} detail={d} proposals={valid.filter((p) => ['submitted', 'in_evaluation'].includes(p.status))} />
    </div>
  )
}

function EvaluateModal({ proposal, criteria, evaluations, onClose }: { proposal: Proposal | null; criteria: svc.OpportunityDetail['criteria']; evaluations: { proposal_id: string; criterion_id: string; evaluator_id: string; score: number }[]; onClose: () => void }) {
  const a = useAuth(), orgs = useOrgNames()
  const [scores, setScores] = useState<Record<string, string>>({})
  useEffect(() => { if (proposal) setScores(Object.fromEntries(criteria.map((c) => [c.id, String(evaluations.find((e) => e.proposal_id === proposal.id && e.criterion_id === c.id && e.evaluator_id === a.ctx?.profile.id)?.score ?? '')]))) }, [proposal, criteria, evaluations, a.ctx])
  const save = useAct(async () => { for (const c of criteria) if (scores[c.id] !== '') await svc.saveEvaluation(proposal!.id, c.id, a.ctx!.profile.id, Number(scores[c.id])) }, 'Avaliação guardada.', onClose)
  const invalid = criteria.some((c) => scores[c.id] !== '' && (Number(scores[c.id]) < 0 || Number(scores[c.id]) > 10))
  return (
    <Modal open={!!proposal} onClose={onClose} title={`Avaliar: ${proposal ? orgs.name(proposal.supplier_org_id) : ''}`} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate()}>Guardar notas</Button></>}>
      <div className="space-y-3">{criteria.map((c) => <Field key={c.id} label={`${c.name} (${Number(c.weight)}%)`} hint="Nota de 0 a 10">{(id) => <Input id={id} type="number" min="0" max="10" step="0.5" value={scores[c.id] ?? ''} onChange={(e) => setScores({ ...scores, [c.id]: e.target.value })} />}</Field>)}</div>
    </Modal>
  )
}

function SupplierDocsModal({ proposal, onClose }: { proposal: Proposal | null; onClose: () => void }) {
  const orgs = useOrgNames(), types = useDocTypes()
  const q = useQuery({ queryKey: ['supplierDocs', proposal?.supplier_org_id], queryFn: () => listDocuments(proposal!.supplier_org_id), enabled: !!proposal })
  return (
    <Modal open={!!proposal} onClose={onClose} wide title={`Documentos aprovados: ${proposal ? orgs.name(proposal.supplier_org_id) : ''}`}>
      <p className="mb-3 text-sm text-ink-soft">Só são visíveis documentos aprovados, porque o fornecedor submeteu proposta a este pedido. Cada abertura de ficheiro fica registada em auditoria.</p>
      {q.isLoading ? <Spinner /> : !q.data?.length ? <p className="text-ink-soft">Sem documentos aprovados.</p> : <ul className="divide-y divide-line">{q.data.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><span><span className="font-semibold text-navy">{x.title}</span><span className="block text-xs text-ink-mute">{types.data?.find((t) => t.id === x.document_type_id)?.name} · válido até {formatDate(x.valid_until) === '—' ? 'sem validade' : formatDate(x.valid_until)}</span></span><OpenFileButton docId={x.id} /></li>)}</ul>}
    </Modal>
  )
}

function DecisionModal({ open, onClose, detail, proposals }: { open: boolean; onClose: () => void; detail: svc.OpportunityDetail; proposals: Proposal[] }) {
  const orgs = useOrgNames()
  const [result, setResult] = useState<'awarded' | 'no_award'>('awarded'), [pid, setPid] = useState(''), [why, setWhy] = useState(''), [amount, setAmount] = useState('')
  const sel = proposals.find((p) => p.id === pid)
  const m = useAct(() => svc.recordDecision(detail.opportunity.id, result, result === 'awarded' ? pid : null, why, amount ? Number(amount) : undefined), 'Decisão registada.', onClose)
  const ok = why.trim().length >= 10 && (result === 'no_award' || !!pid)
  return (
    <Modal open={open} onClose={onClose} title="Registar decisão comercial" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={m.isPending} disabled={!ok} onClick={() => m.mutate()}>Registar decisão</Button></>}>
      <div className="space-y-4">
        <Alert tone="warn">A decisão fica registada de forma permanente e os fornecedores são notificados. Não constitui contrato.</Alert>
        <Field label="Resultado">{(i) => <Select id={i} value={result} onChange={(e) => setResult(e.target.value as 'awarded' | 'no_award')}><option value="awarded">Adjudicar a uma proposta</option><option value="no_award">Encerrar sem adjudicação</option></Select>}</Field>
        {result === 'awarded' && <>
          <Field label="Proposta seleccionada" required>{(i) => <Select id={i} value={pid} onChange={(e) => { setPid(e.target.value); setAmount('') }}><option value="">Seleccione…</option>{proposals.map((p) => <option key={p.id} value={p.id}>{orgs.name(p.supplier_org_id)} — {formatMoney(p.total, p.currency)}</option>)}</Select>}</Field>
          {sel && <Field label={`Valor aprovado (${detail.opportunity.currency})`} hint={`Por omissão, o total da proposta: ${formatMoney(sel.total, sel.currency)}. Altere só se houver negociação registada.`}>{(i) => <Input id={i} type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(sel.total)} />}</Field>}
        </>}
        <Field label="Fundamento da decisão (obrigatório)" hint="Mínimo de 10 caracteres." required>{(i) => <Textarea id={i} rows={4} value={why} onChange={(e) => setWhy(e.target.value)} />}</Field>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------- Esclarecimentos */
function Clarifications({ d, isBuyer, canManage, fd }: { d: svc.OpportunityDetail; isBuyer: boolean; canManage: boolean; fd: Date }) {
  const a = useAuth(), orgs = useOrgNames()
  const [q, setQ] = useState(''), [ans, setAns] = useState<Record<string, string>>({}), [pub, setPub] = useState<Record<string, boolean>>({})
  const myOrg = a.activeMembership?.organization_id
  const ask = useAct(() => svc.askClarification(d.opportunity.id, myOrg as string, q), 'Pergunta enviada.', () => setQ(''))
  const reply = useAct((id: string) => svc.answerClarification(id, ans[id], !!pub[id]), 'Resposta registada.')
  const open = ['open', 'clarification'].includes(d.opportunity.status) && Date.now() < fd.getTime()
  const Item = ({ children }: { children: ReactNode }) => <li className="card p-4">{children}</li>
  return (
    <div className="max-w-3xl space-y-6">
      {d.notices.length > 0 && <section><h2 className="section-title mb-2">Avisos e esclarecimentos públicos</h2><ul className="space-y-2">{d.notices.map((n) => <Item key={n.id}><p className="whitespace-pre-line text-[15px]">{n.body}</p><p className="mt-1 text-xs text-ink-mute">{formatDateTime(n.created_at)}</p></Item>)}</ul></section>}
      {!isBuyer && a.isSupplierOrg && a.can(P.propSubmit) && (
        <section className="card card-pad"><h2 className="section-title mb-2">Pedir esclarecimento</h2>
          {open ? <div className="space-y-3"><Textarea aria-label="A sua pergunta" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escreva a sua dúvida sobre o pedido…" /><Button loading={ask.isPending} disabled={q.trim().length < 5} onClick={() => ask.mutate()}>Enviar pergunta</Button></div> : <p className="text-ink-soft">Já não é possível colocar perguntas: o pedido não está aberto ou o prazo terminou.</p>}
        </section>
      )}
      <section><h2 className="section-title mb-2">{isBuyer ? 'Perguntas recebidas' : 'As suas perguntas'}</h2>
        {d.clarifications.length === 0 ? <p className="text-ink-soft">Sem perguntas.</p> : <ul className="space-y-3">{d.clarifications.map((c) => (
          <Item key={c.id}><p className="text-xs text-ink-mute">{isBuyer ? orgs.name(c.supplier_org_id) + ' · ' : ''}{formatDateTime(c.asked_at)}</p><p className="mt-1 font-semibold text-navy">{c.question}</p>
            {c.answer ? <div className="mt-2 rounded-lg bg-brand-50 p-3 text-[15px]"><p>{c.answer}</p><p className="mt-1 text-xs text-ink-mute">Respondido em {formatDateTime(c.answered_at)}{c.published_as_notice ? ' · publicado a todos os convidados' : ''}</p></div>
              : canManage ? <div className="mt-3 space-y-2"><Textarea aria-label="Resposta" value={ans[c.id] ?? ''} onChange={(e) => setAns({ ...ans, [c.id]: e.target.value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!pub[c.id]} onChange={(e) => setPub({ ...pub, [c.id]: e.target.checked })} />Publicar a todos os convidados (sem identificar quem perguntou)</label><Button small loading={reply.isPending} disabled={(ans[c.id] ?? '').trim().length < 3} onClick={() => reply.mutate(c.id)}>Responder</Button></div>
              : <p className="mt-2 text-sm text-ink-mute">A aguardar resposta.</p>}</Item>))}</ul>}
      </section>
    </div>
  )
}

function History({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['audit', 'entity', id], queryFn: () => listAudit({ entityId: id, pageSize: 50 }) })
  const orgs = useOrgNames()
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  if (!q.data?.rows.length) return <div className="card"><EmptyState title="Sem registos" /></div>
  return <ol className="space-y-2">{q.data.rows.map((r) => <li key={r.id} className="card flex flex-wrap items-start justify-between gap-2 p-3 text-[15px]"><span><span className="font-semibold text-navy">{r.action}</span> <span className="text-ink-mute">· {r.organization_id ? orgs.name(r.organization_id) : 'Sistema'}</span><code className="mt-1 block max-w-full overflow-x-auto text-xs text-ink-soft">{JSON.stringify(r.details)}</code></span><span className="text-sm text-ink-mute">{formatDateTime(r.created_at)}</span></li>)}</ol>
}

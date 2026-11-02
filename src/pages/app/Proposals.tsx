import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ConfirmDialog, DataTable, EmptyState, ErrorState, PageHeader, Spinner, StatusBadge, Textarea, useToast, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { friendlyError } from '@/lib/domain/errors'
import { formatDateTime, formatMoney } from '@/lib/domain/format'
import { PROPOSAL_STATUS } from '@/lib/domain/labels'
import { P } from '@/lib/domain/permissions'
import type { Proposal } from '@/lib/domain/types'
import { listOpportunities } from '@/services/opportunities'
import { listProposals, withdrawProposal } from '@/services/proposals'

export default function Proposals() {
  const a = useAuth(), qc = useQueryClient(), toast = useToast()
  const orgId = a.activeMembership!.organization_id
  const q = useQuery({ queryKey: ['proposals', orgId], queryFn: () => listProposals(orgId) })
  const opps = useQuery({ queryKey: ['opps'], queryFn: listOpportunities })
  const [wd, setWd] = useState<Proposal | null>(null), [reason, setReason] = useState('')
  const m = useMutation({ mutationFn: () => withdrawProposal(wd!.id, reason), onSuccess: () => { toast.success('Proposta retirada.'); setWd(null); setReason(''); qc.invalidateQueries({ queryKey: ['proposals'] }); qc.invalidateQueries({ queryKey: ['opp'] }) }, onError: (e) => toast.error(friendlyError(e)) })
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const opp = (id: string) => opps.data?.find((o) => o.id === id)
  const cols: Column<Proposal>[] = [
    { key: 'n', header: 'Proposta', cell: (p) => <div><span className="font-semibold">{p.number}</span><p className="text-xs text-ink-mute">{p.receipt_code ?? 'Rascunho — ainda não submetida'}</p></div> },
    { key: 'o', header: 'Pedido', cell: (p) => <Link className="kbd-link" to={`/app/pedidos/${p.opportunity_id}`}>{opp(p.opportunity_id)?.title ?? 'Ver pedido'}</Link> },
    { key: 's', header: 'Estado', cell: (p) => <StatusBadge label={PROPOSAL_STATUS[p.status]} /> },
    { key: 't', header: 'Total', align: 'right', cell: (p) => formatMoney(p.total, p.currency) }, { key: 'v', header: 'Versão', align: 'right', cell: (p) => p.current_version || '—' },
    { key: 'd', header: 'Submetida', cell: (p) => formatDateTime(p.submitted_at) },
    { key: 'a', header: 'Acções', cell: (p) => { const o = opp(p.opportunity_id); const live = o && ['open', 'clarification'].includes(o.status) && new Date(o.deadline) > new Date(); return <div className="flex gap-1.5">{live && ['draft', 'submitted', 'withdrawn'].includes(p.status) && a.can(P.propSubmit) && <Link to={`/app/pedidos/${p.opportunity_id}/proposta`} className="btn-secondary btn-sm">{p.status === 'draft' ? 'Continuar' : 'Rever'}</Link>}{live && p.status === 'submitted' && a.can(P.propSubmit) && <Button variant="ghost" small onClick={() => setWd(p)}>Retirar</Button>}</div> } },
  ]
  return (
    <>
      <PageHeader title="Propostas" subtitle="As propostas da sua empresa, com confirmação de recepção e histórico de versões." />
      <DataTable rows={q.data ?? []} columns={cols} rowKey={(p) => p.id} caption="Propostas da organização" empty={<EmptyState icon={<ClipboardList />} title="Ainda sem propostas">Abra um pedido para o qual tenha convite e prepare a sua proposta.</EmptyState>} />
      <ConfirmDialog open={!!wd} danger title="Retirar proposta" confirmLabel="Retirar proposta" loading={m.isPending} onConfirm={() => m.mutate()} onClose={() => setWd(null)} message="A proposta deixa de contar para este pedido. Só pode retirar até ao fim do prazo; pode submeter de novo se o prazo ainda estiver aberto.">
        <Textarea aria-label="Motivo (opcional)" className="mt-3" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </>
  )
}

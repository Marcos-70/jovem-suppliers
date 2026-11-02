import { useQuery } from '@tanstack/react-query'
import { Briefcase, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, DataTable, EmptyState, ErrorState, Input, PageHeader, Select, Spinner, StatusBadge, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useOrgNames } from '@/hooks/useOrgNames'
import { formatDateTime } from '@/lib/domain/format'
import { OPP_STATUS } from '@/lib/domain/labels'
import { deadlineState, timeLeft } from '@/lib/domain/opportunity'
import { P } from '@/lib/domain/permissions'
import type { Opportunity } from '@/lib/domain/types'
import { listOpportunities } from '@/services/opportunities'

export default function Opportunities() {
  const a = useAuth(), nav = useNavigate(), orgs = useOrgNames()
  const q = useQuery({ queryKey: ['opps'], queryFn: listOpportunities })
  const [status, setStatus] = useState(''), [term, setTerm] = useState('')
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const myOrg = a.activeMembership?.organization_id
  const rows = (q.data ?? []).filter((o) => (!status || o.status === status) && (!term || `${o.title} ${o.number}`.toLowerCase().includes(term.toLowerCase())))
  const cols: Column<Opportunity>[] = [
    { key: 'n', header: 'Nº', cell: (o) => <span className="font-semibold">{o.number}</span>, sort: (x, y) => x.number.localeCompare(y.number) },
    { key: 't', header: 'Pedido', cell: (o) => <div><Link to={`/app/pedidos/${o.id}`} className="kbd-link">{o.title}</Link>{o.buyer_org_id === myOrg ? <p className="text-xs text-ink-mute">Criado pela sua empresa</p> : <p className="text-xs text-ink-mute">{orgs.name(o.buyer_org_id)}</p>}</div>, sort: (x, y) => x.title.localeCompare(y.title) },
    { key: 's', header: 'Estado', cell: (o) => <StatusBadge label={OPP_STATUS[o.status]} /> },
    { key: 'd', header: 'Prazo', cell: (o) => { const d = new Date(o.deadline); const st = ['open', 'clarification'].includes(o.status) ? deadlineState(d) : null; return <div>{formatDateTime(o.deadline)}{st && <p className="mt-0.5"><Badge tone={st === 'passed' ? 'danger' : st === 'closing_soon' ? 'warn' : 'neutral'}>{timeLeft(d)}</Badge></p>}</div> }, sort: (x, y) => x.deadline.localeCompare(y.deadline) },
    { key: 'c', header: 'Moeda', cell: (o) => o.currency },
  ]
  return (
    <>
      <PageHeader title="Pedidos de cotação" subtitle={a.isBuyerOrg && a.can(P.oppCreate) ? 'Crie pedidos, convide fornecedores qualificados e decida com base em propostas comparáveis.' : 'Pedidos para os quais a sua organização foi convidada ou autorizada a responder.'}
        actions={a.isBuyerOrg && a.can(P.oppCreate) && <Button onClick={() => nav('/app/pedidos/novo')}><Plus className="h-4 w-4" aria-hidden />Novo pedido</Button>} />
      <div className="mb-3 flex flex-wrap gap-3">
        <Input aria-label="Pesquisar pedidos" className="max-w-xs" placeholder="Pesquisar por título ou número" value={term} onChange={(e) => setTerm(e.target.value)} />
        <Select aria-label="Filtrar por estado" className="max-w-[240px]" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os estados</option>{Object.entries(OPP_STATUS).map(([k, l]) => <option key={k} value={k}>{l.text}</option>)}</Select>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(o) => o.id} caption="Pedidos de cotação" empty={<EmptyState icon={<Briefcase />} title="Sem pedidos">{a.isBuyerOrg ? 'Crie o primeiro pedido de cotação.' : 'Quando for convidado para um pedido, ele aparece aqui e recebe uma notificação.'}</EmptyState>} />
    </>
  )
}

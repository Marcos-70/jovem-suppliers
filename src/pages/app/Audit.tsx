import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Select, Spinner } from '@/components/ui'
import { useOrgNames } from '@/hooks/useOrgNames'
import { formatDateTime } from '@/lib/domain/format'
import { listAudit } from '@/services/audit'

const ENTITIES = ['organizations', 'organization', 'documents', 'document', 'opportunities', 'opportunity', 'proposals', 'commercial_decisions', 'organization_members', 'supplier_invitations', 'deadline_extensions']

export default function Audit() {
  const [f, setF] = useState({ entityType: '', from: '', to: '' }), [page, setPage] = useState(0)
  const orgs = useOrgNames()
  const q = useQuery({ queryKey: ['audit', f, page], queryFn: () => listAudit({ entityType: f.entityType || undefined, from: f.from || undefined, to: f.to || undefined, page }) })
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Registo imutável de acções críticas: quem fez o quê e quando. Só leitura." />
      <div className="card card-pad mb-4 flex flex-wrap items-end gap-3">
        <Field label="Entidade">{(i) => <Select id={i} className="w-60" value={f.entityType} onChange={(e) => { setPage(0); setF({ ...f, entityType: e.target.value }) }}><option value="">Todas</option>{ENTITIES.map((x) => <option key={x}>{x}</option>)}</Select>}</Field>
        <Field label="De">{(i) => <Input id={i} type="date" className="w-44" value={f.from} onChange={(e) => { setPage(0); setF({ ...f, from: e.target.value }) }} />}</Field>
        <Field label="Até">{(i) => <Input id={i} type="date" className="w-44" value={f.to} onChange={(e) => { setPage(0); setF({ ...f, to: e.target.value }) }} />}</Field>
      </div>
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.rows.length ? <div className="card"><EmptyState title="Sem registos para estes filtros" /></div> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse"><caption className="sr-only">Registos de auditoria</caption>
          <thead><tr><th className="th">Quando</th><th className="th">Acção</th><th className="th">Organização</th><th className="th">Detalhes</th></tr></thead>
          <tbody>{q.data.rows.map((r) => <tr key={r.id}><td className="td whitespace-nowrap">{formatDateTime(r.created_at)}</td><td className="td"><Badge tone="info">{r.action}</Badge></td><td className="td">{r.organization_id ? orgs.name(r.organization_id) : 'Plataforma'}</td><td className="td"><code className="block max-w-md overflow-x-auto text-xs text-ink-soft">{JSON.stringify(r.details)}</code></td></tr>)}</tbody></table></div>
          <Pagination page={page} pages={Math.max(1, Math.ceil(q.data.count / 25))} total={q.data.count} onChange={setPage} /></div>
      )}
    </>
  )
}

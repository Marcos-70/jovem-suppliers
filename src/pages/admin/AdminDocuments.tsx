import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { DocStatusBadge, DocumentDetailModal, OpenFileButton, ValidityCell } from '@/components/DocumentParts'
import { Alert, Button, DataTable, EmptyState, ErrorState, Modal, PageHeader, Select, Spinner, Textarea, useToast, type Column } from '@/components/ui'
import { useDocTypes } from '@/hooks/useCatalog'
import { useOrgNames } from '@/hooks/useOrgNames'
import { effectiveDocStatus } from '@/lib/domain/documents'
import { friendlyError } from '@/lib/domain/errors'
import { formatDateTime } from '@/lib/domain/format'
import { DOC_STATUS } from '@/lib/domain/labels'
import type { DocumentRow } from '@/lib/domain/types'
import { listAllDocuments, reviewDocument, startReview } from '@/services/documents'

export default function AdminDocuments() {
  const q = useQuery({ queryKey: ['admin-docs'], queryFn: listAllDocuments }), types = useDocTypes(), orgs = useOrgNames(), qc = useQueryClient(), toast = useToast()
  const [filter, setFilter] = useState('pending'), [rev, setRev] = useState<DocumentRow | null>(null), [detail, setDetail] = useState<DocumentRow | null>(null)
  const [reason, setReason] = useState(''), [err, setErr] = useState<string>()
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-docs'] }); qc.invalidateQueries({ queryKey: ['reportData'] }); qc.invalidateQueries({ queryKey: ['unread'] }) }
  const start = useMutation({ mutationFn: (d: DocumentRow) => startReview(d.id), onSuccess: () => { toast.success('Análise iniciada.'); refresh() }, onError: (e) => toast.error(friendlyError(e)) })
  const decide = useMutation({ mutationFn: (r: 'approved' | 'rejected' | 'correction_requested') => reviewDocument(rev!.id, r, reason), onSuccess: () => { toast.success('Resultado registado e fornecedor notificado.'); setRev(null); setReason(''); setErr(undefined); refresh() }, onError: (e) => setErr(friendlyError(e)) })
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const all = q.data ?? []
  const rows = all.filter((d) => (filter === 'pending' ? ['submitted', 'under_review'].includes(d.status) : filter === '' ? true : effectiveDocStatus(d) === filter))
  const tn = (id: string) => types.data?.find((t) => t.id === id)?.name
  const cols: Column<DocumentRow>[] = [
    { key: 'o', header: 'Organização', cell: (d) => orgs.name(d.organization_id) }, { key: 't', header: 'Documento', cell: (d) => <div><button className="kbd-link text-left" onClick={() => setDetail(d)}>{d.title}</button><p className="text-xs text-ink-mute">{tn(d.document_type_id)} · v{d.current_version}</p></div> },
    { key: 's', header: 'Estado', cell: (d) => <DocStatusBadge doc={d} /> }, { key: 'v', header: 'Validade', cell: (d) => <ValidityCell date={d.valid_until} /> },
    { key: 'd', header: 'Submetido', sort: (x, y) => x.submitted_at.localeCompare(y.submitted_at), cell: (d) => formatDateTime(d.submitted_at) },
    { key: 'a', header: 'Acções', cell: (d) => <div className="flex flex-wrap gap-1.5"><OpenFileButton docId={d.id} />{d.status === 'submitted' && <Button variant="secondary" small onClick={() => start.mutate(d)}>Iniciar análise</Button>}{['submitted', 'under_review'].includes(d.status) && <Button small onClick={() => setRev(d)}>Decidir</Button>}</div> },
  ]
  return (
    <>
      <PageHeader title="Revisão documental" subtitle="Cada decisão fica registada com o revisor, a hora e o motivo, e o fornecedor é notificado." />
      <div className="mb-3"><Select aria-label="Filtro" className="max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="pending">Por analisar</option><option value="">Todos</option>{Object.entries(DOC_STATUS).filter(([k]) => !['missing', 'superseded'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l.text}</option>)}</Select></div>
      <DataTable rows={rows} columns={cols} rowKey={(d) => d.id} caption="Documentos" empty={<EmptyState title="Nada por analisar">A fila está vazia.</EmptyState>} />
      <Modal open={!!rev} onClose={() => { setRev(null); setErr(undefined) }} title={`Decidir: ${rev?.title ?? ''}`} footer={<><Button variant="danger" disabled={reason.trim().length < 3} loading={decide.isPending && decide.variables === 'rejected'} onClick={() => decide.mutate('rejected')}>Rejeitar</Button><Button variant="secondary" disabled={reason.trim().length < 3} onClick={() => decide.mutate('correction_requested')}>Pedir correcção</Button><Button loading={decide.isPending && decide.variables === 'approved'} onClick={() => decide.mutate('approved')}>Aprovar</Button></>}>
        <div className="space-y-3">{err && <Alert tone="danger">{err}</Alert>}{rev && <OpenFileButton docId={rev.id} small={false} label="Abrir ficheiro para análise" />}
          <label className="label" htmlFor="rsn">Motivo (obrigatório para rejeitar ou pedir correcção)</label><Textarea id="rsn" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Documento ilegível; digitalize novamente com maior resolução." /></div>
      </Modal>
      <DocumentDetailModal doc={detail} type={detail ? types.data?.find((t) => t.id === detail.document_type_id) : undefined} onClose={() => setDetail(null)} />
    </>
  )
}

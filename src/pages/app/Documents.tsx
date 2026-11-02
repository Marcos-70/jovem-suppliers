import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, History, Upload } from 'lucide-react'
import { useState } from 'react'
import { DocStatusBadge, DocumentDetailModal, OpenFileButton, ValidityCell } from '@/components/DocumentParts'
import { Alert, Badge, Button, DataTable, EmptyState, ErrorState, Field, FilePicker, Input, Modal, PageHeader, Select, Spinner, StatCard, useToast, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useDocTypes, useRequirements } from '@/hooks/useCatalog'
import { effectiveDocStatus, requirementApplies, requirementSatisfied, validateUpload } from '@/lib/domain/documents'
import { friendlyError } from '@/lib/domain/errors'
import { formatDate } from '@/lib/domain/format'
import { DOC_STATUS } from '@/lib/domain/labels'
import { P } from '@/lib/domain/permissions'
import type { DocumentRow } from '@/lib/domain/types'
import { listDocuments, uploadDocument } from '@/services/documents'
import { listServices } from '@/services/organizations'

export default function Documents() {
  const a = useAuth()
  const orgId = a.activeMembership!.organization_id
  const qc = useQueryClient(), toast = useToast()
  const types = useDocTypes(), reqs = useRequirements()
  const docs = useQuery({ queryKey: ['docs', orgId], queryFn: () => listDocuments(orgId) })
  const services = useQuery({ queryKey: ['services', orgId], queryFn: () => listServices(orgId) })
  const [filter, setFilter] = useState('')
  const [upload, setUpload] = useState<{ replace?: DocumentRow } | null>(null)
  const [detail, setDetail] = useState<DocumentRow | null>(null)
  const typeMap = new Map((types.data ?? []).map((t) => [t.id, t]))
  if (docs.isLoading || types.isLoading) return <Spinner />
  if (docs.isError) return <ErrorState error={docs.error} retry={() => docs.refetch()} />
  const all = docs.data ?? []
  const rows = all.filter((d) => !filter || effectiveDocStatus(d) === filter)
  const count = (s: string) => all.filter((d) => effectiveDocStatus(d) === s).length
  const cats = (services.data ?? []).map((s) => s.category_id)
  const applicable = (reqs.data ?? []).filter((r) => requirementApplies(r, cats))
  const canUpload = a.can(P.docUpload)

  const cols: Column<DocumentRow>[] = [
    { key: 'title', header: 'Documento', cell: (d) => <div><button className="kbd-link text-left" onClick={() => setDetail(d)}>{d.title}</button><p className="text-xs text-ink-mute">{typeMap.get(d.document_type_id)?.name}</p></div>, sort: (x, y) => x.title.localeCompare(y.title) },
    { key: 'status', header: 'Estado', cell: (d) => <DocStatusBadge doc={d} /> },
    { key: 'valid', header: 'Validade', cell: (d) => <ValidityCell date={d.valid_until} />, sort: (x, y) => (x.valid_until ?? '9999').localeCompare(y.valid_until ?? '9999') },
    { key: 'ver', header: 'Versão', cell: (d) => `v${d.current_version}`, align: 'right' },
    { key: 'sub', header: 'Submetido', cell: (d) => formatDate(d.submitted_at), sort: (x, y) => x.submitted_at.localeCompare(y.submitted_at) },
    { key: 'act', header: 'Acções', cell: (d) => (
      <div className="flex flex-wrap gap-1.5"><OpenFileButton docId={d.id} />
        {canUpload && d.status !== 'under_review' && <Button variant="secondary" small onClick={() => setUpload({ replace: d })}><Upload className="h-4 w-4" aria-hidden />Nova versão</Button>}
        <Button variant="ghost" small onClick={() => setDetail(d)} aria-label={`Histórico de ${d.title}`}><History className="h-4 w-4" aria-hidden /></Button></div>) },
  ]
  return (
    <>
      <PageHeader title="Documentos" subtitle="Registos, licenças e certificados. Cada nova versão reinicia a análise; as versões anteriores ficam guardadas." actions={canUpload && <Button onClick={() => setUpload({})}><FileUp className="h-4 w-4" aria-hidden />Carregar documento</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Válidos e aprovados" value={count('approved')} tone="ok" />
        <StatCard label="Em análise" value={count('submitted') + count('under_review')} tone="info" />
        <StatCard label="Próximos da validade" value={count('expiring')} tone={count('expiring') ? 'warn' : 'neutral'} hint="Alerta a 30, 15 e 7 dias" />
        <StatCard label="Expirados / com problemas" value={count('expired') + count('rejected') + count('correction_pending')} tone={count('expired') + count('rejected') + count('correction_pending') ? 'danger' : 'neutral'} />
      </div>
      {applicable.length > 0 && (
        <section className="card card-pad mb-6" aria-labelledby="req-h">
          <h2 id="req-h" className="section-title mb-1">Requisitos de qualificação</h2>
          <p className="mb-3 text-sm text-ink-soft">Um requisito fica satisfeito com um documento do tipo exigido, aprovado e em vigor.</p>
          <ul className="grid gap-2 sm:grid-cols-2">{applicable.map((r) => { const ok = requirementSatisfied(r, all); return (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"><span className="text-[15px] font-semibold text-navy">{r.name}</span>{ok ? <Badge tone="ok">Satisfeito</Badge> : <Badge tone="warn">Por satisfazer</Badge>}</li>) })}</ul>
        </section>
      )}
      <div className="mb-3 flex items-center gap-3"><label htmlFor="docf" className="text-sm font-semibold text-navy">Estado:</label>
        <Select id="docf" className="!min-h-[36px] max-w-[240px]" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Todos</option>{Object.entries(DOC_STATUS).filter(([k]) => k !== 'missing' && k !== 'superseded').map(([k, l]) => <option key={k} value={k}>{l.text}</option>)}</Select></div>
      <DataTable rows={rows} columns={cols} rowKey={(d) => d.id} caption="Documentos da organização" empty={<EmptyState icon={<FileUp />} title="Sem documentos" action={canUpload ? <Button onClick={() => setUpload({})}>Carregar o primeiro documento</Button> : undefined}>Carregue o registo comercial e o comprovativo fiscal para começar a qualificação.</EmptyState>} />
      <UploadModal key={upload?.replace?.id ?? 'new'} open={!!upload} replace={upload?.replace} orgId={orgId} onClose={() => setUpload(null)} onDone={() => { setUpload(null); toast.success('Documento submetido para análise.'); qc.invalidateQueries({ queryKey: ['docs', orgId] }) }} />
      <DocumentDetailModal doc={detail} type={detail ? typeMap.get(detail.document_type_id) : undefined} onClose={() => setDetail(null)} />
    </>
  )
}

function UploadModal({ open, replace, orgId, onClose, onDone }: { open: boolean; replace?: DocumentRow; orgId: string; onClose: () => void; onDone: () => void }) {
  const types = useDocTypes()
  const [typeId, setTypeId] = useState(replace?.document_type_id ?? '')
  const [title, setTitle] = useState(replace?.title ?? '')
  const [ref, setRef] = useState(replace?.reference_number ?? '')
  const [issue, setIssue] = useState('')
  const [valid, setValid] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<Record<string, string>>({})
  const type = types.data?.find((t) => t.id === typeId)
  const m = useMutation({ mutationFn: () => uploadDocument({ orgId, typeId, title, reference: ref, issue, valid, file: file as File, documentId: replace?.id }), onSuccess: onDone, onError: (e) => setErr({ form: friendlyError(e) }) })
  const submit = () => {
    const e: Record<string, string> = {}
    if (!typeId) e.type = 'Seleccione o tipo de documento'
    if (title.trim().length < 3) e.title = 'Indique um título'
    if (type?.requires_expiry && !valid) e.valid = 'Este tipo de documento exige data de validade'
    if (issue && valid && valid < issue) e.valid = 'A validade não pode ser anterior à emissão'
    if (!file) e.file = 'Seleccione o ficheiro'
    else if (type) { const v = validateUpload(file, type); if (v) e.file = v }
    setErr(e)
    if (!Object.keys(e).length) m.mutate()
  }
  return (
    <Modal open={open} onClose={onClose} title={replace ? `Nova versão de «${replace.title}»` : 'Carregar documento'} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={m.isPending} onClick={submit}>Submeter para análise</Button></>}>
      <div className="space-y-4">
        {err.form && <Alert tone="danger">{err.form}</Alert>}
        <Field label="Tipo de documento" error={err.type} required>{(id, d) => <Select id={id} aria-describedby={d} value={typeId} disabled={!!replace} onChange={(e) => setTypeId(e.target.value)}><option value="">Seleccione…</option>{types.data?.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}</Field>
        <Field label="Título" error={err.title} required>{(id, d) => <Input id={id} aria-describedby={d} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Número de referência">{(id) => <Input id={id} value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data de emissão">{(id) => <Input id={id} type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />}</Field>
          <Field label="Válido até" error={err.valid} required={type?.requires_expiry} hint={type && !type.requires_expiry ? 'Opcional para este tipo.' : undefined}>{(id, d) => <Input id={id} type="date" aria-describedby={d} value={valid} onChange={(e) => setValid(e.target.value)} />}</Field>
        </div>
        <div><p className="label">Ficheiro</p><FilePicker file={file} onChange={setFile} accept={type?.allowed_mime.join(',') ?? '.pdf,.jpg,.jpeg,.png'} hint={type ? `Máximo ${type.max_size_mb} MB` : 'PDF, JPG ou PNG'} />{err.file && <p role="alert" className="field-error">{err.file}</p>}</div>
        <p className="text-sm text-ink-mute">O ficheiro fica em armazenamento privado. Só a sua organização e a equipa de análise o consultam.</p>
      </div>
    </Modal>
  )
}

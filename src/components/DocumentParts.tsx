import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Badge, Button, Modal, Spinner, StatusBadge, useToast } from '@/components/ui'
import { friendlyError } from '@/lib/domain/errors'
import { effectiveDocStatus } from '@/lib/domain/documents'
import { formatBytes, formatDate, formatDateTime, daysUntil } from '@/lib/domain/format'
import { DOC_STATUS } from '@/lib/domain/labels'
import type { DocumentRow, DocumentType } from '@/lib/domain/types'
import { listReviews, listVersions, openDocument } from '@/services/documents'

export const DocStatusBadge = ({ doc }: { doc: Pick<DocumentRow, 'status' | 'valid_until'> }) => <StatusBadge label={DOC_STATUS[effectiveDocStatus(doc)]} />

export function ValidityCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-ink-mute">Sem validade</span>
  const d = daysUntil(date)
  return <span>{formatDate(date)}<span className={`ml-1.5 text-xs font-semibold ${d < 0 ? 'text-danger' : d <= 30 ? 'text-warn' : 'text-ink-mute'}`}>{d < 0 ? `(expirou há ${-d} d)` : `(${d} d)`}</span></span>
}

export function OpenFileButton({ docId, small = true, label = 'Ver ficheiro' }: { docId: string; small?: boolean; label?: string }) {
  const toast = useToast()
  return <Button variant="secondary" small={small} onClick={() => openDocument(docId).catch((e) => toast.error(friendlyError(e)))}><Download className="h-4 w-4" aria-hidden />{label}</Button>
}

export function DocumentDetailModal({ doc, type, onClose }: { doc: DocumentRow | null; type?: DocumentType; onClose: () => void }) {
  const versions = useQuery({ queryKey: ['versions', doc?.id], queryFn: () => listVersions(doc!.id), enabled: !!doc })
  const reviews = useQuery({ queryKey: ['reviews', doc?.id], queryFn: () => listReviews(doc!.id), enabled: !!doc })
  return (
    <Modal open={!!doc} onClose={onClose} wide title={doc?.title ?? ''} footer={doc && <OpenFileButton docId={doc.id} small={false} label="Abrir versão actual" />}>
      {doc && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><DocStatusBadge doc={doc} />{type && <Badge>{type.name}</Badge>}<span className="text-sm text-ink-mute">Versão {doc.current_version} · {doc.file_name} · {formatBytes(doc.file_size)}</span></div>
          {doc.review_reason && <div className="rounded-lg bg-warn-bg p-3 text-[15px]"><p className="font-semibold text-warn">Última indicação da análise</p><p className="text-ink">{doc.review_reason}</p></div>}
          <section><h3 className="section-title !text-base mb-2">Versões</h3>
            {versions.isLoading ? <Spinner /> : <ul className="divide-y divide-line rounded-lg border border-line">{versions.data?.map((v) => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[15px]"><span>Versão {v.version} · {v.file_name}</span><span className="flex items-center gap-2 text-sm text-ink-mute">{formatDateTime(v.submitted_at)}<StatusBadge label={DOC_STATUS[v.status]} /></span></li>)}</ul>}</section>
          <section><h3 className="section-title !text-base mb-2">Histórico de análises</h3>
            {reviews.isLoading ? <Spinner /> : !reviews.data?.length ? <p className="text-ink-soft">Ainda sem análises.</p> : <ul className="space-y-2">{reviews.data.map((r) => <li key={r.id} className="rounded-lg border border-line p-3 text-[15px]"><p className="font-semibold text-navy">{r.result === 'approved' ? 'Aprovado' : r.result === 'rejected' ? 'Rejeitado' : 'Correcção pedida'} <span className="font-normal text-ink-mute">· {formatDateTime(r.reviewed_at)}</span></p>{r.reason && <p className="text-ink-soft">{r.reason}</p>}</li>)}</ul>}</section>
        </div>
      )}
    </Modal>
  )
}

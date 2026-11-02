import { db } from '@/lib/supabase'
import { safeFileName } from '@/lib/domain/documents'
import type { DocumentReview, DocumentRow, DocumentVersion } from '@/lib/domain/types'
import { fetchAll, unwrap } from './core'

export const listDocuments = (orgId: string) =>
  fetchAll<DocumentRow>((a, b) => db.from('documents').select('*').eq('organization_id', orgId).order('updated_at', { ascending: false }).range(a, b))
export const listAllDocuments = () => fetchAll<DocumentRow>((a, b) => db.from('documents').select('*').order('submitted_at', { ascending: true }).range(a, b))
export const listVersions = async (docId: string) => unwrap(await db.from('document_versions').select('*').eq('document_id', docId).order('version', { ascending: false })) as DocumentVersion[]
export const listReviews = async (docId: string) => unwrap(await db.from('document_reviews').select('*').eq('document_id', docId).order('reviewed_at', { ascending: false })) as DocumentReview[]

export interface UploadInput {
  orgId: string; typeId: string; title: string; reference?: string; issue?: string; valid?: string; file: File; documentId?: string
}
/** Carrega o ficheiro para armazenamento privado e regista o documento/versão no servidor. */
export async function uploadDocument(i: UploadInput): Promise<string> {
  const path = `${i.orgId}/${crypto.randomUUID()}/${safeFileName(i.file.name)}`
  const up = await db.storage.from('documents').upload(path, i.file, { contentType: i.file.type, upsert: false })
  if (up.error) throw new Error(up.error.message)
  const res = await db.rpc('upload_document', {
    p_org: i.orgId, p_type: i.typeId, p_title: i.title, p_reference: i.reference || null, p_issue: i.issue || null, p_valid: i.valid || null,
    p_storage_path: path, p_file_name: i.file.name, p_file_size: i.file.size, p_mime: i.file.type, p_document_id: i.documentId ?? null,
  })
  if (res.error) {
    await db.storage.from('documents').remove([path]) // não deixa ficheiros órfãos
    throw new Error(res.error.message)
  }
  return res.data as string
}

/** Pede acesso (registado em auditoria quando é de terceiros) e abre o ficheiro por URL assinada de curta duração. */
export async function openDocument(docId: string) {
  const path = unwrap(await db.rpc('request_document_access', { p_doc: docId })) as string
  const { data, error } = await db.storage.from('documents').createSignedUrl(path, 60)
  if (error || !data) throw new Error(error?.message ?? 'NOT_FOUND')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}
export const startReview = async (docId: string) => unwrap(await db.rpc('start_document_review', { p_doc: docId }))
export const reviewDocument = async (docId: string, result: 'approved' | 'rejected' | 'correction_requested', reason?: string) =>
  unwrap(await db.rpc('review_document', { p_doc: docId, p_result: result, p_reason: reason ?? null }))

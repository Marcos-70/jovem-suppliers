import { daysUntil } from './format'
import type { EffectiveDocStatus } from './labels'
import type { DocumentRow, QualificationRequirement } from './types'

export const DEFAULT_ALERT_DAYS = [30, 15, 7]

/**
 * Estado efectivo: "Expirado" e "Próximo da validade" derivam da data de validade
 * de documentos aprovados; o estado guardado na base de dados não muda sozinho.
 * Documentos sem validade (tipos que não a exigem) nunca expiram.
 */
export function effectiveDocStatus(
  doc: Pick<DocumentRow, 'status' | 'valid_until'>,
  now: Date = new Date(),
  alertDays: number[] = DEFAULT_ALERT_DAYS,
): EffectiveDocStatus {
  if (doc.status === 'approved' && doc.valid_until) {
    const d = daysUntil(doc.valid_until, now)
    if (d < 0) return 'expired'
    if (d <= Math.max(...alertDays)) return 'expiring'
  }
  return doc.status
}

/** Um documento conta como "em vigor" se está aprovado e não expirou. */
export function isDocInForce(doc: Pick<DocumentRow, 'status' | 'valid_until'>, now: Date = new Date()): boolean {
  if (doc.status !== 'approved') return false
  return !doc.valid_until || daysUntil(doc.valid_until, now) >= 0
}

export function requirementApplies(req: QualificationRequirement, orgCategoryIds: string[]): boolean {
  return req.is_active && (req.category_id === null || orgCategoryIds.includes(req.category_id))
}

/** Satisfeito = existe documento do tipo, aprovado, em vigor e com a validade mínima restante. */
export function requirementSatisfied(
  req: QualificationRequirement,
  docs: Pick<DocumentRow, 'document_type_id' | 'status' | 'valid_until'>[],
  now: Date = new Date(),
): boolean {
  return docs.some((d) => {
    if (d.document_type_id !== req.document_type_id || !isDocInForce(d, now)) return false
    if (!d.valid_until) return true
    return daysUntil(d.valid_until, now) >= req.min_validity_days
  })
}

export const ALLOWED_UPLOAD_MIME = ['application/pdf', 'image/jpeg', 'image/png']

export function validateUpload(
  file: { name: string; size: number; type: string },
  type: { max_size_mb: number; allowed_mime: string[] },
): string | null {
  if (!type.allowed_mime.includes(file.type)) return 'Tipo de ficheiro não permitido para este documento.'
  if (file.size <= 0) return 'O ficheiro está vazio.'
  if (file.size > type.max_size_mb * 1024 * 1024) return `O ficheiro excede o limite de ${type.max_size_mb} MB.`
  return null
}

export function safeFileName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120)
}

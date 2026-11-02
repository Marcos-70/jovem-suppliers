/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/supabase'
import { safeFileName } from '@/lib/domain/documents'
import type {
  Clarification, CommercialDecision, DeadlineExtension, Evaluation, EvaluationCriterion, Invitation, Notice,
  Opportunity, OpportunityItem, Proposal, ProposalItem,
} from '@/lib/domain/types'
import { fetchAll, unwrap } from './core'

export const listOpportunities = () => fetchAll<Opportunity>((a, b) => db.from('opportunities').select('*').order('created_at', { ascending: false }).range(a, b))

export interface Attachment { id: string; organization_id: string; entity_type: string; entity_id: string; storage_path: string; file_name: string; file_size: number; created_at: string }
export interface OpportunityDetail {
  opportunity: Opportunity; items: OpportunityItem[]; criteria: EvaluationCriterion[]; extensions: DeadlineExtension[]
  invitations: Invitation[]; notices: Notice[]; clarifications: Clarification[]; decision: CommercialDecision | null; attachments: Attachment[]
}
export async function getOpportunityDetail(id: string): Promise<OpportunityDetail> {
  const [opportunity, items, criteria, extensions, invitations, notices, clarifications, decision, attachments] = await Promise.all([
    db.from('opportunities').select('*').eq('id', id).single(),
    db.from('opportunity_items').select('*').eq('opportunity_id', id).order('position'),
    db.from('evaluation_criteria').select('*').eq('opportunity_id', id).order('position'),
    db.from('deadline_extensions').select('*').eq('opportunity_id', id).order('created_at'),
    db.from('supplier_invitations').select('*').eq('opportunity_id', id),
    db.from('opportunity_notices').select('*').eq('opportunity_id', id).order('created_at', { ascending: false }),
    db.from('clarifications').select('*').eq('opportunity_id', id).order('asked_at', { ascending: false }),
    db.from('commercial_decisions').select('*').eq('opportunity_id', id).maybeSingle(),
    db.from('attachments').select('*').eq('entity_type', 'opportunity').eq('entity_id', id),
  ])
  return {
    opportunity: unwrap(opportunity) as Opportunity, items: unwrap(items) as OpportunityItem[], criteria: unwrap(criteria) as EvaluationCriterion[],
    extensions: unwrap(extensions) as DeadlineExtension[], invitations: unwrap(invitations) as Invitation[], notices: unwrap(notices) as Notice[],
    clarifications: unwrap(clarifications) as Clarification[], decision: (decision.data as CommercialDecision) ?? null, attachments: (attachments.data ?? []) as Attachment[],
  }
}

export interface OppForm {
  title: string; description?: string; category_id?: string; delivery_location?: string; deadline: string; currency: string
  commercial_terms?: string; technical_requirements?: string; required_document_type_ids: string[]
  visibility: 'invited_only' | 'open_to_qualified'; sealed_until_deadline: boolean
}
export interface ItemForm { description: string; quantity: number; unit: string; technical_spec?: string }
export interface CriterionForm { name: string; weight: number; kind: 'technical' | 'commercial'; description?: string }

const header = (v: OppForm) => ({
  title: v.title.trim(), description: v.description || null, category_id: v.category_id || null, delivery_location: v.delivery_location || null,
  deadline: new Date(v.deadline).toISOString(), currency: v.currency, commercial_terms: v.commercial_terms || null,
  technical_requirements: v.technical_requirements || null, required_document_type_ids: v.required_document_type_ids,
  visibility: v.visibility, sealed_until_deadline: v.sealed_until_deadline,
})
async function replaceChildren(oppId: string, items: ItemForm[], criteria: CriterionForm[]) {
  unwrap(await db.from('opportunity_items').delete().eq('opportunity_id', oppId))
  unwrap(await db.from('evaluation_criteria').delete().eq('opportunity_id', oppId))
  if (items.length) unwrap(await db.from('opportunity_items').insert(items.map((it, i) => ({ opportunity_id: oppId, position: i + 1, description: it.description, quantity: it.quantity, unit: it.unit, technical_spec: it.technical_spec || null }))))
  if (criteria.length) unwrap(await db.from('evaluation_criteria').insert(criteria.map((c, i) => ({ opportunity_id: oppId, position: i + 1, name: c.name, weight: c.weight, kind: c.kind, description: c.description || null }))))
}
export async function createOpportunity(orgId: string, userId: string, v: OppForm, items: ItemForm[], criteria: CriterionForm[]): Promise<string> {
  const row = unwrap(await db.from('opportunities').insert({ ...header(v), buyer_org_id: orgId, created_by: userId, responsible_id: userId }).select('id').single()) as { id: string }
  await replaceChildren(row.id, items, criteria)
  return row.id
}
/** Rascunho: tudo editável. Após publicação só os textos (alterações notificam os convidados). */
export async function updateOpportunity(id: string, v: OppForm, items: ItemForm[] | null, criteria: CriterionForm[] | null, draft: boolean) {
  const h: Record<string, unknown> = header(v)
  if (!draft) { delete h.deadline; delete h.currency; delete h.sealed_until_deadline }
  unwrap(await db.from('opportunities').update(h).eq('id', id))
  if (draft && items && criteria) await replaceChildren(id, items, criteria)
}
export const publishOpportunity = async (id: string, invitees: string[], open = true) => unwrap(await db.rpc('publish_opportunity', { p_opp: id, p_invitees: invitees, p_open: open }))
export const inviteSuppliers = async (id: string, invitees: string[]) => unwrap(await db.rpc('invite_suppliers', { p_opp: id, p_invitees: invitees }))
export const setOpportunityStatus = async (id: string, to: string, reason?: string) => unwrap(await db.rpc('set_opportunity_status', { p_opp: id, p_to: to, p_reason: reason ?? null }))
export const extendDeadline = async (id: string, newDeadline: string, reason: string, supplier?: string) =>
  unwrap(await db.rpc('extend_deadline', { p_opp: id, p_new: new Date(newDeadline).toISOString(), p_supplier: supplier ?? null, p_reason: reason }))
export const markViewed = async (opp: string, supplier: string) => { await db.rpc('mark_invitation_viewed', { p_opp: opp, p_supplier: supplier }) }
export const askClarification = async (opp: string, supplier: string, question: string) => unwrap(await db.rpc('ask_clarification', { p_opp: opp, p_supplier_org: supplier, p_question: question }))
export const answerClarification = async (id: string, answer: string, publish: boolean) => unwrap(await db.rpc('answer_clarification', { p_id: id, p_answer: answer, p_publish: publish }))
export const recordDecision = async (opp: string, result: 'awarded' | 'no_award', proposal: string | null, rationale: string, amount?: number) =>
  unwrap(await db.rpc('record_decision', { p_opp: opp, p_result: result, p_proposal: proposal, p_rationale: rationale, p_amount: amount ?? null }))

export interface OppProposals { proposals: Proposal[]; items: ProposalItem[]; evaluations: Evaluation[] }
export async function getProposalsForOpportunity(oppId: string): Promise<OppProposals> {
  const proposals = unwrap(await db.from('proposals').select('*').eq('opportunity_id', oppId).neq('status', 'draft').order('total')) as Proposal[]
  if (!proposals.length) return { proposals, items: [], evaluations: [] }
  const ids = proposals.map((p) => p.id)
  const [items, evals] = await Promise.all([db.from('proposal_items').select('*').in('proposal_id', ids), db.from('evaluations').select('*').in('proposal_id', ids)])
  return { proposals, items: unwrap(items) as ProposalItem[], evaluations: (evals.data ?? []) as Evaluation[] }
}
export async function saveEvaluation(proposalId: string, criterionId: string, evaluatorId: string, score: number, comment?: string) {
  unwrap(await db.from('evaluations').upsert({ proposal_id: proposalId, criterion_id: criterionId, evaluator_id: evaluatorId, score, comment: comment || null }, { onConflict: 'proposal_id,criterion_id,evaluator_id' }))
}

export async function uploadAttachment(orgId: string, entityType: 'opportunity' | 'proposal', entityId: string, file: File) {
  const path = `${orgId}/${entityType}/${crypto.randomUUID()}/${safeFileName(file.name)}`
  const up = await db.storage.from('attachments').upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) throw new Error(up.error.message)
  const r = await db.rpc('add_attachment', { p_org: orgId, p_entity_type: entityType, p_entity_id: entityId, p_path: path, p_name: file.name, p_size: file.size, p_mime: file.type })
  if (r.error) { await db.storage.from('attachments').remove([path]); throw new Error(r.error.message) }
}
export async function openAttachment(a: Attachment) {
  const { data, error } = await db.storage.from('attachments').createSignedUrl(a.storage_path, 60)
  if (error || !data) throw new Error(error?.message ?? 'NOT_FOUND')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

import { db } from '@/lib/supabase'
import type { Proposal, ProposalItem, ProposalVersion } from '@/lib/domain/types'
import { fetchAll, unwrap } from './core'
import type { Attachment } from './opportunities'

export const listProposals = (orgId: string) => fetchAll<Proposal>((a, b) => db.from('proposals').select('*').eq('supplier_org_id', orgId).order('created_at', { ascending: false }).range(a, b))
export async function getMyProposal(oppId: string, orgId: string) {
  const p = unwrap(await db.from('proposals').select('*').eq('opportunity_id', oppId).eq('supplier_org_id', orgId).maybeSingle()) as Proposal | null
  if (!p) return null
  const [items, versions, atts] = await Promise.all([
    db.from('proposal_items').select('*').eq('proposal_id', p.id), db.from('proposal_versions').select('*').eq('proposal_id', p.id).order('version', { ascending: false }),
    db.from('attachments').select('*').eq('entity_type', 'proposal').eq('entity_id', p.id),
  ])
  return { proposal: p, items: unwrap(items) as ProposalItem[], versions: unwrap(versions) as ProposalVersion[], attachments: (atts.data ?? []) as Attachment[] }
}
export interface ProposalPayload {
  validity_until: string; delivery_days: number; currency: string; commercial_terms?: string; notes?: string
  items: { opportunity_item_id: string; unit_price: number; discount_pct: number; tax_pct: number }[]
}
export const saveProposal = async (orgId: string, oppId: string, payload: ProposalPayload, submit: boolean) =>
  unwrap(await db.rpc('save_proposal', { p_supplier_org: orgId, p_opp: oppId, p_payload: payload, p_submit: submit })) as string
export const withdrawProposal = async (id: string, reason?: string) => unwrap(await db.rpc('withdraw_proposal', { p_proposal: id, p_reason: reason ?? null }))

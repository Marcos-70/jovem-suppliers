import type { DeadlineExtension, Opportunity, OpportunityStatus, Proposal } from './types'

/** Prazo final: o maior entre o original e qualquer extensão (espelha public.final_deadline). */
export function finalDeadline(opp: Pick<Opportunity, 'deadline'>, ext: Pick<DeadlineExtension, 'new_deadline'>[]): Date {
  return new Date(Math.max(new Date(opp.deadline).getTime(), ...ext.map((e) => new Date(e.new_deadline).getTime())))
}

/** Prazo efectivo para um fornecedor: extensões gerais ou dirigidas a esse fornecedor. */
export function effectiveDeadline(
  opp: Pick<Opportunity, 'deadline'>,
  ext: Pick<DeadlineExtension, 'new_deadline' | 'supplier_org_id'>[],
  supplierOrgId: string,
): Date {
  return finalDeadline(opp, ext.filter((e) => e.supplier_org_id === null || e.supplier_org_id === supplierOrgId))
}

export type DeadlineState = 'open' | 'closing_soon' | 'passed'
export function deadlineState(deadline: Date, now: Date = new Date()): DeadlineState {
  const ms = deadline.getTime() - now.getTime()
  if (ms <= 0) return 'passed'
  return ms <= 48 * 3_600_000 ? 'closing_soon' : 'open'
}

export function timeLeft(deadline: Date, now: Date = new Date()): string {
  const ms = deadline.getTime() - now.getTime()
  if (ms <= 0) return 'Prazo terminado'
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min restantes`
  if (h < 48) return `${h} h restantes`
  return `${Math.floor(h / 24)} dias restantes`
}

/** Um fornecedor só pode submeter com o pedido aberto e dentro do prazo efectivo. */
export function canSubmitProposal(
  oppStatus: OpportunityStatus,
  effective: Date,
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  if (oppStatus !== 'open' && oppStatus !== 'clarification') return { ok: false, reason: 'O pedido não está aberto para propostas.' }
  if (now.getTime() > effective.getTime()) return { ok: false, reason: 'O prazo para apresentação terminou.' }
  return { ok: true }
}

/** Matriz de transições (espelha public.opp_transition_allowed). 'awarded' só via decisão. */
const TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['invites_sent', 'open', 'cancelled'],
  invites_sent: ['open', 'cancelled'],
  open: ['under_evaluation', 'clarification', 'closed', 'cancelled'],
  clarification: ['open', 'under_evaluation', 'closed', 'cancelled'],
  under_evaluation: ['clarification', 'closed', 'cancelled'],
  closed: ['archived', 'cancelled'],
  awarded: ['archived'],
  cancelled: ['archived'],
  archived: [],
}
export const allowedTransitions = (s: OpportunityStatus): OpportunityStatus[] => TRANSITIONS[s]

/** Propostas válidas para relatórios: submetidas dentro do prazo e ainda não retiradas. */
export function isValidProposal(
  p: Pick<Proposal, 'status' | 'submitted_at' | 'validity_until' | 'supplier_org_id'>,
  opp: Pick<Opportunity, 'deadline'>,
  ext: Pick<DeadlineExtension, 'new_deadline' | 'supplier_org_id'>[],
): boolean {
  if (!['submitted', 'in_evaluation', 'selected'].includes(p.status) || !p.submitted_at) return false
  if (new Date(p.submitted_at).getTime() > effectiveDeadline(opp, ext, p.supplier_org_id).getTime()) return false
  if (p.validity_until && p.validity_until < p.submitted_at.slice(0, 10)) return false
  return true
}

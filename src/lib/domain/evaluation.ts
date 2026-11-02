import type { Evaluation, EvaluationCriterion } from './types'

export const weightsTotal = (c: Pick<EvaluationCriterion, 'weight'>[]) =>
  Math.round(c.reduce((a, x) => a + Number(x.weight), 0) * 100) / 100

/** Sem critérios é permitido (comparação só por preço); com critérios os pesos somam 100. */
export const weightsValid = (c: Pick<EvaluationCriterion, 'weight'>[]) => c.length === 0 || weightsTotal(c) === 100

export interface MatrixRow {
  proposalId: string
  perCriterion: Record<string, number | null> // média das notas dos avaliadores (0–10)
  weighted: number | null // só existe se TODOS os critérios têm nota
  missing: number
}

/**
 * Matriz de apoio à decisão, sem decisão automática: a nota ponderada é
 * Σ(peso × nota) / Σ(pesos), visível e documentada. Critérios sem nota impedem
 * o cálculo da nota global (em vez de assumir zero).
 */
export function evaluationMatrix(
  proposalIds: string[],
  criteria: EvaluationCriterion[],
  evaluations: Pick<Evaluation, 'proposal_id' | 'criterion_id' | 'score'>[],
): MatrixRow[] {
  return proposalIds.map((pid) => {
    const per: Record<string, number | null> = {}
    let missing = 0
    for (const c of criteria) {
      const s = evaluations.filter((e) => e.proposal_id === pid && e.criterion_id === c.id).map((e) => Number(e.score))
      per[c.id] = s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
      if (per[c.id] === null) missing++
    }
    let weighted: number | null = null
    if (criteria.length > 0 && missing === 0) {
      const wt = criteria.reduce((a, c) => a + Number(c.weight), 0)
      weighted = Math.round((criteria.reduce((a, c) => a + Number(c.weight) * (per[c.id] as number), 0) / wt) * 100) / 100
    }
    return { proposalId: pid, perCriterion: per, weighted, missing }
  })
}

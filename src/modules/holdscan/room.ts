import { type OBB, type PointCloud, type V3, type Plane, countPoints, dot, fitPlane, getPoint, orientedBox, planeDistance, ransacPlane } from './geometry'

export interface RoomEstimate {
  /** Distâncias entre pares de planos paralelos (m), do maior para o menor. Vazio se não houve 3 pares. */
  planeDims: number[]
  planeRms: number[]          // resíduo RMS dos planos usados (m)
  obb: OBB                    // caixa envolvente orientada (alternativa sempre disponível)
  obbDims: number[]           // extensões (m), do maior para o menor
  planesFound: number
  method: 'planos' | 'caixa_envolvente'
  notes: string[]
}

/**
 * Estima as dimensões de um espaço aproximadamente paralelepipédico: extrai planos por RANSAC sequencial,
 * emparelha os paralelos e mede a distância entre eles. Se não encontrar 3 pares, usa a caixa envolvente.
 * NÃO é válida para porões com estruturas complexas (tremonhas, nervuras): indica apenas a caixa envolvente aproximada.
 */
export function estimateRoom(pc: PointCloud, o: { threshold?: number; seed?: number } = {}): RoomEstimate {
  const n = countPoints(pc), mask = new Uint8Array(n), planes: { plane: Plane; support: number; rms: number }[] = []
  const th = o.threshold ?? 0.04
  for (let k = 0; k < 8; k++) {
    const f = ransacPlane(pc, { threshold: th, minInliers: Math.max(60, Math.floor(n * 0.02)), seed: (o.seed ?? 3) + k, mask, iterations: 500 })
    if (!f) break
    f.inliers.forEach((i) => (mask[i] = 1))
    planes.push({ plane: f.plane, support: f.inliers.length, rms: f.rms })
  }
  // Refinamento: o limiar passa a acompanhar o ruído observado (resíduo dos planos) e cada ponto
  // é atribuído ao plano mais próximo, para que o ruído não deixe pontos de fora e enviese o ajuste.
  // Com muito ruído, a mesma parede pode ser encontrada duas vezes (duas «fatias»): fundem-se planos paralelos muito próximos.
  const dedupe = () => {
    for (let i = 0; i < planes.length; i++) for (let j = planes.length - 1; j > i; j--) {
      const a = planes[i], b = planes[j], sgn = dot(a.plane.n, b.plane.n) < 0 ? -1 : 1
      if (Math.abs(dot(a.plane.n, b.plane.n)) > 0.985 && Math.abs(a.plane.d - sgn * b.plane.d) < 3 * Math.max(a.rms, b.rms, th)) {
        if (b.support > a.support) planes[i] = b
        planes.splice(j, 1)
      }
    }
  }
  dedupe()
  for (let pass = 0; pass < 3 && planes.length; pass++) {
    if (pass === 1) dedupe()
    const limit = planes.map((p) => Math.min(0.3, Math.max(th, 2.5 * p.rms)))
    const groups: number[][] = planes.map(() => [])
    for (let i = 0; i < n; i++) {
      const x = getPoint(pc, i); let best = -1, bd = Infinity
      for (let k = 0; k < planes.length; k++) { const d = Math.abs(planeDistance(planes[k].plane, x)); if (d < limit[k] && d < bd) { bd = d; best = k } }
      if (best >= 0) groups[best].push(i)
    }
    planes.forEach((p, k) => {
      if (groups[k].length < 20) return
      p.plane = fitPlane(pc, groups[k]); p.support = groups[k].length
      let ss = 0; for (const i of groups[k]) ss += planeDistance(p.plane, getPoint(pc, i)) ** 2
      p.rms = Math.sqrt(ss / groups[k].length)
    })
  }
  const obb = orientedBox(pc), notes: string[] = []
  const used = new Set<number>(), pairs: { dist: number; rms: number; normal: V3 }[] = []
  for (let i = 0; i < planes.length; i++) {
    if (used.has(i)) continue
    let best = -1
    for (let j = i + 1; j < planes.length; j++) {
      if (used.has(j) || Math.abs(dot(planes[i].plane.n, planes[j].plane.n)) < 0.97) continue
      if (best < 0 || planes[j].support > planes[best].support) best = j
    }
    if (best < 0) continue
    const a = planes[i].plane, b = planes[best].plane, s = dot(a.n, b.n) < 0 ? -1 : 1
    pairs.push({ dist: Math.abs(a.d - s * b.d), rms: Math.max(planes[i].rms, planes[best].rms), normal: a.n })
    used.add(i); used.add(best)
  }
  // três pares mutuamente ortogonais
  let sel: typeof pairs = []
  if (pairs.length >= 3) {
    const sorted = [...pairs].sort((x, y) => y.dist - x.dist)
    for (let a = 0; a < sorted.length && !sel.length; a++) for (let b = a + 1; b < sorted.length && !sel.length; b++) for (let c = b + 1; c < sorted.length && !sel.length; c++) {
      if (Math.abs(dot(sorted[a].normal, sorted[b].normal)) < 0.2 && Math.abs(dot(sorted[a].normal, sorted[c].normal)) < 0.2 && Math.abs(dot(sorted[b].normal, sorted[c].normal)) < 0.2) sel = [sorted[a], sorted[b], sorted[c]]
    }
  }
  if (!sel.length) notes.push(`Só foram encontrados ${pairs.length} par(es) de planos paralelos; usada a caixa envolvente orientada.`)
  notes.push('Estimativa da caixa envolvente aproximada; não representa estruturas internas do porão.')
  return {
    planeDims: sel.map((p) => p.dist).sort((a, b) => b - a), planeRms: sel.map((p) => p.rms), obb, obbDims: [...obb.extents].sort((a, b) => b - a),
    planesFound: planes.length, method: sel.length ? 'planos' : 'caixa_envolvente', notes,
  }
}

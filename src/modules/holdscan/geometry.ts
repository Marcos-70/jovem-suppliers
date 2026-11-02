// Geometria 3D para o SMART HOLD SCAN. Convenção do mundo: metros, eixo Y para cima (como o three.js).
export type V3 = [number, number, number]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const dist = (a: V3, b: V3) => len(sub(a, b))

export interface PointCloud { positions: Float32Array; colors?: Uint8Array }
export const countPoints = (pc: PointCloud) => pc.positions.length / 3
export const getPoint = (pc: PointCloud, i: number): V3 => [pc.positions[3 * i], pc.positions[3 * i + 1], pc.positions[3 * i + 2]]
export function fromPoints(pts: V3[]): PointCloud {
  const p = new Float32Array(pts.length * 3)
  pts.forEach((v, i) => { p[3 * i] = v[0]; p[3 * i + 1] = v[1]; p[3 * i + 2] = v[2] })
  return { positions: p }
}

export function bbox(pc: PointCloud) {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < countPoints(pc); i++) for (let k = 0; k < 3; k++) { const v = pc.positions[3 * i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v }
  return { min, max, size: sub(max, min) as V3 }
}

/** Média por voxel: reduz o ruído e o número de pontos mantendo a forma. */
export function voxelDownsample(pc: PointCloud, voxel: number): PointCloud {
  const acc = new Map<string, { s: V3; n: number; c: [number, number, number] }>()
  const n = countPoints(pc)
  for (let i = 0; i < n; i++) {
    const x = pc.positions[3 * i], y = pc.positions[3 * i + 1], z = pc.positions[3 * i + 2]
    const key = `${Math.floor(x / voxel)},${Math.floor(y / voxel)},${Math.floor(z / voxel)}`
    let a = acc.get(key)
    if (!a) { a = { s: [0, 0, 0], n: 0, c: [0, 0, 0] }; acc.set(key, a) }
    a.s[0] += x; a.s[1] += y; a.s[2] += z; a.n++
    if (pc.colors) { a.c[0] += pc.colors[3 * i]; a.c[1] += pc.colors[3 * i + 1]; a.c[2] += pc.colors[3 * i + 2] }
  }
  const out = new Float32Array(acc.size * 3), col = pc.colors ? new Uint8Array(acc.size * 3) : undefined
  let j = 0
  for (const a of acc.values()) {
    out[3 * j] = a.s[0] / a.n; out[3 * j + 1] = a.s[1] / a.n; out[3 * j + 2] = a.s[2] / a.n
    if (col) { col[3 * j] = a.c[0] / a.n; col[3 * j + 1] = a.c[1] / a.n; col[3 * j + 2] = a.c[2] / a.n }
    j++
  }
  return { positions: out, colors: col }
}

/** Valores e vectores próprios de uma matriz simétrica 3×3 (Jacobi), por ordem decrescente. */
export function eigenSym3(m: number[]): { values: V3; vectors: [V3, V3, V3] } {
  const a = [...m]
  let v = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let sweep = 0; sweep < 60; sweep++) {
    const off = Math.abs(a[1]) + Math.abs(a[2]) + Math.abs(a[5])
    if (off < 1e-15) break
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = a[3 * p + q]
      if (Math.abs(apq) < 1e-300) continue
      const theta = (a[3 * q + q] - a[3 * p + p]) / (2 * apq)
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1), s = t * c
      for (let k = 0; k < 3; k++) { const akp = a[3 * k + p], akq = a[3 * k + q]; a[3 * k + p] = c * akp - s * akq; a[3 * k + q] = s * akp + c * akq }
      for (let k = 0; k < 3; k++) { const apk = a[3 * p + k], aqk = a[3 * q + k]; a[3 * p + k] = c * apk - s * aqk; a[3 * q + k] = s * apk + c * aqk }
      for (let k = 0; k < 3; k++) { const vkp = v[3 * k + p], vkq = v[3 * k + q]; v[3 * k + p] = c * vkp - s * vkq; v[3 * k + q] = s * vkp + c * vkq }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[3 * j + j] - a[3 * i + i])
  const vec = (i: number): V3 => [v[i], v[3 + i], v[6 + i]]
  return { values: [a[3 * idx[0] + idx[0]], a[3 * idx[1] + idx[1]], a[3 * idx[2] + idx[2]]], vectors: [vec(idx[0]), vec(idx[1]), vec(idx[2])] }
}

function covariance(pc: PointCloud, idx?: ArrayLike<number>) {
  const n = idx ? idx.length : countPoints(pc)
  const c: V3 = [0, 0, 0]
  for (let k = 0; k < n; k++) { const i = idx ? idx[k] : k; c[0] += pc.positions[3 * i]; c[1] += pc.positions[3 * i + 1]; c[2] += pc.positions[3 * i + 2] }
  c[0] /= n; c[1] /= n; c[2] /= n
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let k = 0; k < n; k++) {
    const i = idx ? idx[k] : k
    const d = [pc.positions[3 * i] - c[0], pc.positions[3 * i + 1] - c[1], pc.positions[3 * i + 2] - c[2]]
    for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) m[3 * r + s] += d[r] * d[s]
  }
  return { center: c, cov: m.map((x) => x / Math.max(1, n)) }
}

export interface Plane { n: V3; d: number } // n·x + d = 0, |n| = 1
export const planeDistance = (p: Plane, x: V3) => dot(p.n, x) + p.d

export function fitPlane(pc: PointCloud, idx?: ArrayLike<number>): Plane {
  const { center, cov } = covariance(pc, idx)
  const e = eigenSym3(cov)
  const n = e.vectors[2] // menor variância = normal
  return { n, d: -dot(n, center) }
}

function rng(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 } }
export { rng as seededRng }

export interface PlaneFit { plane: Plane; inliers: number[]; rms: number }
/** RANSAC de plano. `mask[i] = 1` exclui pontos já atribuídos a outros planos. */
export function ransacPlane(pc: PointCloud, o: { iterations?: number; threshold?: number; minInliers?: number; seed?: number; mask?: Uint8Array } = {}): PlaneFit | null {
  const n = countPoints(pc), it = o.iterations ?? 400, th = o.threshold ?? 0.03, rand = rng(o.seed ?? 1)
  const avail: number[] = []
  for (let i = 0; i < n; i++) if (!o.mask || !o.mask[i]) avail.push(i)
  if (avail.length < 3) return null
  let best: number[] = []
  for (let k = 0; k < it; k++) {
    const a = getPoint(pc, avail[Math.floor(rand() * avail.length)]), b = getPoint(pc, avail[Math.floor(rand() * avail.length)]), c = getPoint(pc, avail[Math.floor(rand() * avail.length)])
    const nn = cross(sub(b, a), sub(c, a)); const l = len(nn)
    if (l < 1e-9) continue
    const pl: Plane = { n: mul(nn, 1 / l), d: 0 }; pl.d = -dot(pl.n, a)
    const inl: number[] = []
    for (const i of avail) if (Math.abs(planeDistance(pl, getPoint(pc, i))) < th) inl.push(i)
    if (inl.length > best.length) best = inl
  }
  if (best.length < (o.minInliers ?? 50)) return null
  const plane = fitPlane(pc, best)
  const inliers = avail.filter((i) => Math.abs(planeDistance(plane, getPoint(pc, i))) < th)
  const refit = fitPlane(pc, inliers)
  let ss = 0
  for (const i of inliers) ss += planeDistance(refit, getPoint(pc, i)) ** 2
  return { plane: refit, inliers, rms: Math.sqrt(ss / inliers.length) }
}

export interface OBB { center: V3; axes: [V3, V3, V3]; extents: V3 }
/** Caixa orientada por PCA, com corte de percentis para ignorar pontos soltos (ruído). */
export function orientedBox(pc: PointCloud, trim = 0.005): OBB {
  const { center, cov } = covariance(pc)
  const { vectors } = eigenSym3(cov)
  const n = countPoints(pc)
  const ext: number[] = [], mid: number[] = []
  for (let k = 0; k < 3; k++) {
    const proj = new Float64Array(n)
    for (let i = 0; i < n; i++) proj[i] = dot(sub(getPoint(pc, i), center), vectors[k])
    proj.sort()
    const lo = proj[Math.floor(trim * (n - 1))], hi = proj[Math.ceil((1 - trim) * (n - 1))]
    ext.push(hi - lo); mid.push((hi + lo) / 2)
  }
  const c = add(center, add(add(mul(vectors[0], mid[0]), mul(vectors[1], mid[1])), mul(vectors[2], mid[2])))
  return { center: c, axes: vectors, extents: [ext[0], ext[1], ext[2]] }
}

/** Volume por tetraedros com sinal. Só é fiável para malhas FECHADAS (watertight). */
export function meshVolume(positions: ArrayLike<number>, indices: ArrayLike<number>): { volume: number; watertight: boolean } {
  let v = 0
  const edges = new Map<string, number>()
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2]
    const a: V3 = [positions[3 * ia], positions[3 * ia + 1], positions[3 * ia + 2]], b: V3 = [positions[3 * ib], positions[3 * ib + 1], positions[3 * ib + 2]], c: V3 = [positions[3 * ic], positions[3 * ic + 1], positions[3 * ic + 2]]
    v += dot(a, cross(b, c)) / 6
    for (const [p, q] of [[ia, ib], [ib, ic], [ic, ia]]) { const k = p < q ? `${p}_${q}` : `${q}_${p}`; edges.set(k, (edges.get(k) ?? 0) + 1) }
  }
  let watertight = edges.size > 0
  for (const c of edges.values()) if (c !== 2) { watertight = false; break }
  return { volume: Math.abs(v), watertight }
}

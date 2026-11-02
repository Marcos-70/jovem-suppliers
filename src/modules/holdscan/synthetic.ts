import { DepthFusion, backproject, intrinsicsFromFov, lookAt, rotate, type Intrinsics, type Pose } from './depth'
import { type PointCloud, type V3, seededRng } from './geometry'

/** Espaço de teste SINTÉTICO: caixa oca (comprimento × altura × largura) com medidas exactas conhecidas. */
export interface BoxSpec { length: number; height: number; width: number }
export interface NoiseSpec {
  sigmaConst: number   // m — ruído fixo do sensor
  sigmaFrac: number    // fracção da distância (ex.: 0.005 = 0,5 %)
  dropout: number      // probabilidade de uma leitura falhar
  scaleError: number   // erro sistemático de escala (ex.: 0.02 = +2 %)
  driftPerFrame: number // m — deriva aleatória da posição por frame (SLAM)
}
export const NOISE_NONE: NoiseSpec = { sigmaConst: 0, sigmaFrac: 0, dropout: 0, scaleError: 0, driftPerFrame: 0 }

function gauss(r: () => number) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) }

/** Lança raios de dentro da caixa [0,L]×[0,H]×[0,W]; devolve z-depth (m) com ruído. */
export function renderBoxDepth(box: BoxSpec, k: Intrinsics, pose: Pose, noise: NoiseSpec, r: () => number): Float32Array {
  const out = new Float32Array(k.width * k.height), lim: V3 = [box.length, box.height, box.width], o = pose.position
  for (let v = 0; v < k.height; v++) for (let u = 0; u < k.width; u++) {
    const dw = rotate(pose.rotation, [(u + 0.5 - k.cx) / k.fx, (v + 0.5 - k.cy) / k.fy, 1])
    let t = Infinity
    for (let a = 0; a < 3; a++) { if (dw[a] > 1e-12) t = Math.min(t, (lim[a] - o[a]) / dw[a]); else if (dw[a] < -1e-12) t = Math.min(t, (0 - o[a]) / dw[a]) }
    if (!(t > 0 && isFinite(t)) || r() < noise.dropout) continue
    const sigma = noise.sigmaConst + noise.sigmaFrac * t
    out[v * k.width + u] = Math.max(0, (t + (sigma ? gauss(r) * sigma : 0)) * (1 + noise.scaleError))
  }
  return out
}

export interface SyntheticScan { cloud: PointCloud; truth: BoxSpec & { volume: number }; frames: number; rawPoints: number; params: { noise: NoiseSpec; seed: number; voxel: number } }

/** Trajectória a 3 alturas × 12 azimutes × 3 inclinações, dentro do espaço. */
export function generateSyntheticScan(box: BoxSpec, o: { noise?: NoiseSpec; seed?: number; voxel?: number; width?: number; height?: number; hfov?: number } = {}): SyntheticScan {
  const noise = o.noise ?? NOISE_NONE, seed = o.seed ?? 7, voxel = o.voxel ?? 0.06
  const r = seededRng(seed), k = intrinsicsFromFov(o.width ?? 72, o.height ?? 54, o.hfov ?? 70), fusion = new DepthFusion()
  let drift: V3 = [0, 0, 0], frames = 0
  const center: V3 = [box.length / 2, box.height / 2, box.width / 2]
  const stations: V3[] = [[0.3, 0.3, 0.3], [0.7, 0.4, 0.5], [0.5, 0.6, 0.7]].map((f) => [center[0] + (f[0] - 0.5) * box.length * 0.5, box.height * f[1], center[2] + (f[2] - 0.5) * box.width * 0.5] as V3)
  for (const eye of stations) for (let az = 0; az < 12; az++) for (const pitch of [-0.7, 0, 0.7]) {
    const a = (az / 12) * 2 * Math.PI
    const target: V3 = [eye[0] + Math.cos(a) * Math.cos(pitch), eye[1] + Math.sin(pitch), eye[2] + Math.sin(a) * Math.cos(pitch)]
    const truePose = lookAt(eye, target)
    const depth = renderBoxDepth(box, k, truePose, noise, r)
    // A deriva desloca a pose ESTIMADA (o que o dispositivo julga) face à real.
    if (noise.driftPerFrame) drift = [drift[0] + gauss(r) * noise.driftPerFrame, drift[1] + gauss(r) * noise.driftPerFrame, drift[2] + gauss(r) * noise.driftPerFrame]
    const est: Pose = { rotation: truePose.rotation, position: [eye[0] + drift[0], eye[1] + drift[1], eye[2] + drift[2]] }
    fusion.addPoints(backproject(depth, k, est, { stride: 1, maxDepth: 60 }))
    frames++
  }
  return { cloud: fusion.toCloud(voxel), truth: { ...box, volume: box.length * box.height * box.width }, frames, rawPoints: fusion.total, params: { noise, seed, voxel } }
}

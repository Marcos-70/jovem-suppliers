import { type PointCloud, type V3, cross, norm, sub, voxelDownsample } from './geometry'

// Convenção da câmara (como OpenCV): x → direita, y → baixo, z → frente. Poses são câmara→mundo.
export interface Intrinsics { fx: number; fy: number; cx: number; cy: number; width: number; height: number }
export interface Pose { position: V3; rotation: number[] } // rotação 3×3 por linhas (colunas = eixos x,y,z da câmara no mundo)

export function intrinsicsFromFov(width: number, height: number, hfovDeg: number): Intrinsics {
  const fx = width / 2 / Math.tan((hfovDeg * Math.PI) / 360)
  return { fx, fy: fx, cx: width / 2, cy: height / 2, width, height }
}

/** Câmara em `eye` a olhar para `target` (mundo com Y para cima). */
export function lookAt(eye: V3, target: V3, up: V3 = [0, 1, 0]): Pose {
  const f = norm(sub(target, eye))
  let r = cross(f, up); if (Math.hypot(...r) < 1e-6) r = [1, 0, 0]
  r = norm(r)
  const d = cross(f, r) // y da câmara (baixo)
  return { position: eye, rotation: [r[0], d[0], f[0], r[1], d[1], f[1], r[2], d[2], f[2]] }
}

export const rotate = (R: number[], v: V3): V3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]

/** Converte um mapa de profundidade (z em metros; 0/NaN = inválido) em pontos no mundo. */
export function backproject(depth: ArrayLike<number>, k: Intrinsics, pose: Pose, o: { stride?: number; minDepth?: number; maxDepth?: number } = {}): V3[] {
  const s = o.stride ?? 1, lo = o.minDepth ?? 0.1, hi = o.maxDepth ?? 30, out: V3[] = []
  for (let v = 0; v < k.height; v += s) for (let u = 0; u < k.width; u += s) {
    const z = depth[v * k.width + u]
    if (!(z > lo && z < hi)) continue
    const p = rotate(pose.rotation, [((u + 0.5 - k.cx) / k.fx) * z, ((v + 0.5 - k.cy) / k.fy) * z, z])
    out.push([p[0] + pose.position[0], p[1] + pose.position[1], p[2] + pose.position[2]])
  }
  return out
}

/** Acumula pontos de várias frames e reduz por voxel. */
export class DepthFusion {
  private chunks: Float32Array[] = []
  total = 0
  addPoints(pts: V3[]) { const a = new Float32Array(pts.length * 3); pts.forEach((p, i) => { a[3 * i] = p[0]; a[3 * i + 1] = p[1]; a[3 * i + 2] = p[2] }); this.chunks.push(a); this.total += pts.length }
  toCloud(voxel = 0.05): PointCloud {
    const all = new Float32Array(this.total * 3); let o = 0
    for (const c of this.chunks) { all.set(c, o); o += c.length }
    return voxelDownsample({ positions: all }, voxel)
  }
}

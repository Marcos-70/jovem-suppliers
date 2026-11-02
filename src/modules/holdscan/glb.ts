// Importação de GLB/glTF (só no navegador). Junta todas as malhas numa única malha em coordenadas de mundo (metros).
import * as THREE from 'three'
import type { ModelData } from './io'

export async function parseGLB(buf: ArrayBuffer): Promise<ModelData> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const gltf = await new Promise<{ scene: THREE.Group }>((res, rej) => new GLTFLoader().parse(buf, '', (g) => res(g as unknown as { scene: THREE.Group }), rej))
  gltf.scene.updateMatrixWorld(true)
  const pos: number[] = [], idx: number[] = [], col: number[] = []; let base = 0, hasColor = false
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh && !(o as THREE.Points).isPoints) return
    const g = (m as THREE.Mesh).geometry as THREE.BufferGeometry, p = g.getAttribute('position'); if (!p) return
    const v = new THREE.Vector3(), c = g.getAttribute('color')
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z); if (c) { hasColor = true; col.push(c.getX(i) * 255, c.getY(i) * 255, c.getZ(i) * 255) } else col.push(200, 200, 200) }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base)
    else if ((m as THREE.Mesh).isMesh) for (let i = 0; i < p.count; i++) idx.push(base + i)
    base += p.count
  })
  if (!pos.length) throw new Error('O ficheiro GLB não contém geometria.')
  return { positions: Float32Array.from(pos), colors: hasColor ? Uint8Array.from(col) : undefined, indices: idx.length ? Uint32Array.from(idx) : undefined, sourceFormat: 'glb' }
}

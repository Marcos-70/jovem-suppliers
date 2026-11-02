// Captura AR com WebXR (Chrome/Edge em Android com ARCore). NÃO TESTADA em dispositivo real neste ambiente.
// O hit-test devolve pontos 3D reais em metros (mundo local, Y para cima). A profundidade é opcional e depende do telemóvel.
import * as THREE from 'three'
import { DepthFusion } from './depth'
import type { PointCloud, V3 } from './geometry'

export interface XRResult { markers: V3[]; cloud: PointCloud | null; depthFrames: number; features: string[]; durationS: number }
export interface XRHandlers { onStatus: (s: string) => void; onMarker: (n: number) => void; onDepth: (frames: number, points: number) => void }
export interface XRController { stop: () => void; addMarker: () => boolean; undoMarker: () => void }

export async function startXRCapture(overlay: HTMLElement, wantDepth: boolean, h: XRHandlers, done: (r: XRResult) => void): Promise<XRController> {
  const xr = (navigator as unknown as { xr?: { requestSession: (m: string, o: object) => Promise<any> } }).xr
  if (!xr) throw new Error('WebXR não disponível neste navegador.')
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local')
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera()
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x22d3ee })); reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1))
  const opt: Record<string, unknown> = { optionalFeatures: ['dom-overlay', 'local-floor'], requiredFeatures: ['hit-test', 'local'], domOverlay: { root: overlay } }
  if (wantDepth) { (opt.optionalFeatures as string[]).push('depth-sensing'); opt.depthSensing = { usagePreference: ['cpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32'] } }
  const session = await xr.requestSession('immersive-ar', opt)
  const features: string[] = Array.from((session.enabledFeatures as string[] | undefined) ?? [])
  h.onStatus(`Sessão AR iniciada. Funcionalidades activas: ${features.join(', ') || 'não indicadas pelo navegador'}.`)
  await renderer.xr.setSession(session)
  const markers: V3[] = [], markerMeshes: THREE.Mesh[] = [], fusion = new DepthFusion(); let depthFrames = 0, lastDepth = 0, hitSource: any = null, hasHit = false
  const t0 = Date.now()
  session.requestReferenceSpace('viewer').then((vs: unknown) => session.requestHitTestSource({ space: vs }).then((s: unknown) => { hitSource = s }))
  const stopBubble = (e: Event) => e.preventDefault(); overlay.addEventListener('beforexrselect', stopBubble)
  const addMarker = () => {
    if (!reticle.visible) return false
    const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix); markers.push([p.x, p.y, p.z])
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 16), new THREE.MeshBasicMaterial({ color: 0xf472b6 })); m.position.copy(p); scene.add(m); markerMeshes.push(m); h.onMarker(markers.length); return true
  }
  session.addEventListener('select', () => { addMarker() })
  const m4 = new THREE.Matrix4(), inv = new THREE.Matrix4(), vt = new THREE.Matrix4(), v4 = new THREE.Vector4()
  renderer.setAnimationLoop((_t: number, frame: any) => {
    if (!frame) return
    const ref = renderer.xr.getReferenceSpace()
    if (hitSource && ref) { const r = frame.getHitTestResults(hitSource); if (r.length) { const pose = r[0].getPose(ref); if (pose) { reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix); hasHit = true } } else if (hasHit) reticle.visible = false }
    if (wantDepth && ref && Date.now() - lastDepth > 250 && fusion.total < 600_000) {
      lastDepth = Date.now()
      const vp = frame.getViewerPose(ref)
      for (const view of vp?.views ?? []) {
        let di: any = null; try { di = frame.getDepthInformation(view) } catch { di = null }
        if (!di) continue
        m4.fromArray(view.projectionMatrix); inv.copy(m4).invert(); vt.fromArray(view.transform.matrix)
        const pts: V3[] = []
        for (let j = 1; j < 15; j++) for (let i = 1; i < 20; i++) {
          const u = i / 20, v = j / 15, d = di.getDepthInMeters(u, v)
          if (!(d > 0.2 && d < 12)) continue
          // Pressuposto (a confirmar em dispositivo): (u,v) com origem no canto superior esquerdo; profundidade medida ao longo do eixo óptico.
          v4.set(2 * u - 1, 1 - 2 * v, -1, 1).applyMatrix4(inv); v4.divideScalar(v4.w)
          const s = d / -v4.z; v4.set(v4.x * s, v4.y * s, v4.z * s, 1).applyMatrix4(vt); pts.push([v4.x, v4.y, v4.z])
        }
        if (pts.length) { fusion.addPoints(pts); depthFrames++; h.onDepth(depthFrames, fusion.total) }
      }
    }
    renderer.render(scene, camera)
  })
  let ended = false
  const finish = () => {
    if (ended) return; ended = true
    renderer.setAnimationLoop(null); overlay.removeEventListener('beforexrselect', stopBubble); renderer.dispose()
    done({ markers, cloud: fusion.total > 0 ? fusion.toCloud(0.04) : null, depthFrames, features, durationS: (Date.now() - t0) / 1000 })
  }
  session.addEventListener('end', finish)
  return { stop: () => { try { session.end() } catch { finish() } }, addMarker, undoMarker: () => { markers.pop(); const m = markerMeshes.pop(); if (m) scene.remove(m); h.onMarker(markers.length) } }
}

/** Testa que funcionalidades o telemóvel concede (precisa de gesto do utilizador). Termina a sessão de imediato. */
export async function probeXRFeatures(): Promise<{ ok: boolean; features: string[]; error?: string }> {
  const xr = (navigator as unknown as { xr?: { requestSession: (m: string, o: object) => Promise<any> } }).xr
  if (!xr) return { ok: false, features: [], error: 'WebXR não disponível.' }
  try {
    const s = await xr.requestSession('immersive-ar', { requiredFeatures: ['local'], optionalFeatures: ['hit-test', 'depth-sensing', 'dom-overlay', 'plane-detection', 'mesh-detection', 'anchors'], depthSensing: { usagePreference: ['cpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32'] }, domOverlay: { root: document.body } })
    const features: string[] = Array.from(s.enabledFeatures ?? []); await s.end(); return { ok: true, features }
  } catch (e) { return { ok: false, features: [], error: (e as Error).message } }
}

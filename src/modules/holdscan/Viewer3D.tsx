import { Eye, Grid3x3, Ruler, RotateCcw, Trash2, Box } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Alert, Button, cx } from '@/components/ui'
import type { V3 } from './geometry'
import type { ModelData } from './io'

export interface Measurement { a: V3; b: V3; distance: number }
interface Props { model: ModelData | null; markers?: V3[]; onMeasure?: (m: Measurement) => void; measurements: Measurement[]; onClearMeasurements: () => void }

/** Visualizador 3D: rotação, zoom, medição entre dois pontos, caixa envolvente e eixo vertical Y/Z. Unidade: metro. */
export function Viewer3D({ model, markers, onMeasure, measurements, onClearMeasurements }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ setMode: (m: boolean) => void; reset: () => void; vis: (k: 'points' | 'mesh' | 'wire' | 'box', v: boolean) => void; up: (z: boolean) => void; clear: () => void } | null>(null)
  const [fail, setFail] = useState<string | null>(null)
  const [measure, setMeasure] = useState(false)
  const [v, setV] = useState({ points: true, mesh: true, wire: false, box: true, zUp: false })
  const cb = useRef({ onMeasure, onClearMeasurements }); cb.current = { onMeasure, onClearMeasurements }

  useEffect(() => {
    const el = host.current
    if (!el || !model) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }) } catch { setFail('Este dispositivo/navegador não consegue criar um contexto WebGL. O modelo não pode ser visualizado aqui, mas pode ser exportado.'); return }
    setFail(null)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setClearColor(0x0b1a2b)
    el.appendChild(renderer.domElement); renderer.domElement.style.touchAction = 'none'; renderer.domElement.style.display = 'block'
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1, 0.01, 5000), root = new THREE.Group(); scene.add(root)
    scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(5, 10, 7); scene.add(dl)
    // geometria
    const pos = model.positions, n = pos.length / 3
    const box = new THREE.Box3(); const tmp = new THREE.Vector3()
    for (let i = 0; i < n; i++) box.expandByPoint(tmp.set(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]))
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), diag = Math.max(0.5, size.length())
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    if (model.colors) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Array.from(model.colors, (x) => x / 255)), 3))
    const pointsObj = new THREE.Points(geo, new THREE.PointsMaterial({ size: Math.max(0.01, diag / 500), sizeAttenuation: true, color: model.colors ? 0xffffff : 0x5eead4, vertexColors: !!model.colors }))
    root.add(pointsObj)
    let meshObj: THREE.Mesh | null = null, wireObj: THREE.LineSegments | null = null
    if (model.indices) {
      const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setIndex(new THREE.BufferAttribute(model.indices, 1)); mg.computeVertexNormals()
      meshObj = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: 0x9fb4c9, side: THREE.DoubleSide, flatShading: true, roughness: 0.9 })); root.add(meshObj)
      wireObj = new THREE.LineSegments(new THREE.WireframeGeometry(mg), new THREE.LineBasicMaterial({ color: 0x0d9488, transparent: true, opacity: 0.55 })); wireObj.visible = false; root.add(wireObj)
      pointsObj.visible = false
    }
    const boxHelper = new THREE.Box3Helper(box, 0xfbbf24); root.add(boxHelper)
    const grid = new THREE.GridHelper(Math.ceil(diag * 1.2), Math.ceil(diag * 1.2), 0x2f5b88, 0x21446a); grid.position.set(center.x, box.min.y, center.z); root.add(grid)
    root.add(new THREE.AxesHelper(1)) // 1 m por eixo (vermelho X, verde Y, azul Z)
    const mk = new THREE.Group(); root.add(mk)
    const dot = (p: V3, c: number) => { const s = new THREE.Mesh(new THREE.SphereGeometry(diag * 0.007, 12, 12), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); s.position.set(...p); s.renderOrder = 10; mk.add(s) }
    markers?.forEach((p) => dot(p, 0xf472b6))
    // câmara + controlos
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true
    const reset = () => { camera.position.copy(center).add(new THREE.Vector3(diag * 0.8, diag * 0.6, diag * 0.9)); controls.target.copy(center); camera.near = diag / 1000; camera.far = diag * 50; camera.updateProjectionMatrix(); controls.update() }
    reset()
    const resize = () => { const w = el.clientWidth || 600, h = el.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    resize(); const ro = new ResizeObserver(resize); ro.observe(el)
    // medição
    let measuring = false, pending: THREE.Vector3 | null = null, down: [number, number] | null = null
    const ray = new THREE.Raycaster(); ray.params.Points = { threshold: diag * 0.006 }
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY] }
    const onUp = (e: PointerEvent) => {
      if (!measuring || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const targets: THREE.Object3D[] = []
      if (meshObj?.visible) targets.push(meshObj)
      if (pointsObj.visible) targets.push(pointsObj)
      const hits = ray.intersectObjects(targets, false)
      if (!hits.length) return
      const p = hits[0].point.clone(); dot([p.x, p.y, p.z], 0x22d3ee)
      if (!pending) { pending = p; return }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pending, p]), new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false })); line.renderOrder = 10; mk.add(line)
      cb.current.onMeasure?.({ a: [pending.x, pending.y, pending.z], b: [p.x, p.y, p.z], distance: pending.distanceTo(p) }); pending = null
    }
    renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp)
    let raf = 0; const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop) }; loop()
    api.current = {
      setMode: (m) => { measuring = m; pending = null },
      reset,
      vis: (k, val) => { if (k === 'points') pointsObj.visible = val; if (k === 'mesh' && meshObj) meshObj.visible = val; if (k === 'wire' && wireObj) wireObj.visible = val; if (k === 'box') boxHelper.visible = val },
      up: (z) => { root.rotation.x = z ? -Math.PI / 2 : 0 },
      clear: () => { for (const c of [...mk.children]) { if (!markers?.some((m) => (c as THREE.Mesh).position?.distanceTo(new THREE.Vector3(...m)) < 1e-9)) mk.remove(c) } pending = null },
    }
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp)
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose()) })
      renderer.dispose(); el.removeChild(renderer.domElement); api.current = null
    }
  }, [model, markers])

  useEffect(() => { api.current?.setMode(measure) }, [measure, model])
  const toggle = (k: 'points' | 'mesh' | 'wire' | 'box') => { const nv = !v[k]; setV({ ...v, [k]: nv }); api.current?.vis(k, nv) }
  const btn = (on: boolean) => cx('btn-sm btn border', on ? 'border-brand bg-brand-50 text-brand-800' : 'border-line-strong bg-white text-ink-soft')
  if (!model) return <div className="card grid h-72 place-items-center text-ink-soft">Sem modelo carregado.</div>
  if (fail) return <Alert tone="warn" title="Visualização 3D indisponível">{fail}</Alert>
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2" role="toolbar" aria-label="Controlos do modelo 3D">
        <button className={btn(measure)} aria-pressed={measure} onClick={() => setMeasure(!measure)}><Ruler className="h-4 w-4" aria-hidden />Medir entre 2 pontos</button>
        <button className={btn(v.points)} aria-pressed={v.points} onClick={() => toggle('points')}><Grid3x3 className="h-4 w-4" aria-hidden />Pontos</button>
        {model.indices && <><button className={btn(v.mesh)} aria-pressed={v.mesh} onClick={() => toggle('mesh')}><Eye className="h-4 w-4" aria-hidden />Malha</button><button className={btn(v.wire)} aria-pressed={v.wire} onClick={() => toggle('wire')}>Arame</button></>}
        <button className={btn(v.box)} aria-pressed={v.box} onClick={() => toggle('box')}><Box className="h-4 w-4" aria-hidden />Caixa</button>
        <button className={btn(v.zUp)} aria-pressed={v.zUp} title="Use se o modelo aparecer deitado (origem Z para cima)" onClick={() => { setV({ ...v, zUp: !v.zUp }); api.current?.up(!v.zUp) }}>Eixo vertical Z</button>
        <Button variant="secondary" small onClick={() => api.current?.reset()}><RotateCcw className="h-4 w-4" aria-hidden />Repor vista</Button>
        {measurements.length > 0 && <Button variant="ghost" small onClick={() => { api.current?.clear(); cb.current.onClearMeasurements() }}><Trash2 className="h-4 w-4" aria-hidden />Limpar medições</Button>}
      </div>
      <div ref={host} className="h-[min(62vh,520px)] min-h-[320px] w-full overflow-hidden rounded-card border border-line" role="img" aria-label="Modelo 3D interactivo. Arraste para rodar, use dois dedos para zoom." />
      <p className="mt-1.5 text-xs text-ink-mute">Arraste para rodar · dois dedos / roda do rato para aproximar · no modo «Medir», toque em dois pontos do modelo. Eixos: vermelho X, verde Y (cima), azul Z — cada eixo mede 1 m.</p>
    </div>
  )
}

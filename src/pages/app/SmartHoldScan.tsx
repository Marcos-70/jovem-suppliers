import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Download, FileUp, FlaskConical, Radar, Save, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, DataTable, EmptyState, Field, Input, PageHeader, Select, Spinner, TabPanel, Tabs, Textarea, useToast, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { friendlyError } from '@/lib/domain/errors'
import { formatBytes, formatDateTime, formatNumber } from '@/lib/domain/format'
import { SCAN_METHOD_LABEL } from '@/lib/domain/labels'
import { P } from '@/lib/domain/permissions'
import type { HoldScan, ScanMethod, ScanValidation } from '@/lib/domain/types'
import { addValidation, downloadScanModel, getCriteria, listScans, listValidations, saveScan } from '@/services/scans'
import { detectCapabilities, type ScanCapabilities } from '@/modules/holdscan/capabilities'
import { voxelDownsample, type V3, bbox, countPoints } from '@/modules/holdscan/geometry'
import { meshVolume } from '@/modules/holdscan/geometry'
import { parseGLB } from '@/modules/holdscan/glb'
import { parseOBJ, parsePLY, writeOBJ, writePLY, type ModelData } from '@/modules/holdscan/io'
import { estimateRoom, type RoomEstimate } from '@/modules/holdscan/room'
import { DEFAULT_CASES, runSimulationSuite, type SimRow } from '@/modules/holdscan/simulate'
import { generateSyntheticScan, type BoxSpec } from '@/modules/holdscan/synthetic'
import { VERDICT_LABEL, evaluateValidation, groupByConfig, type ValidationSample } from '@/modules/holdscan/validation'
import { Viewer3D, type Measurement } from '@/modules/holdscan/Viewer3D'
import { probeXRFeatures, startXRCapture, type XRController } from '@/modules/holdscan/xrCapture'

type Tab = 'sensores' | 'digitalizar' | 'modelo' | 'validacao' | 'ajuda'
interface Loaded { model: ModelData; title: string; method: ScanMethod; markers: V3[]; truth?: BoxSpec & { volume: number }; simLabel?: string; fileName?: string; extra?: Record<string, unknown> }

const save = (name: string, data: BlobPart, type: string) => { const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
const shortDevice = () => { const ua = navigator.userAgent; const m = /\(([^)]+)\)/.exec(ua); return (m?.[1] ?? 'Dispositivo').replace(/;?\s*(wv|U)\b/g, '').slice(0, 60) }

export default function SmartHoldScan() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('sensores')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [measures, setMeasures] = useState<Measurement[]>([])
  const [prefill, setPrefill] = useState<number | null>(null)
  const open = (l: Loaded) => { setLoaded(l); setMeasures([]); setTab('modelo') }
  return (
    <>
      <PageHeader title="JOVEM+ SMART HOLD SCAN" subtitle="Protótipo de digitalização 3D de porões. Fase 1: capturar ou importar o espaço, visualizar, medir e exportar — e validar a precisão contra medidas físicas. O cálculo de volume de carga ainda não está activo." />
      <div className="mb-5"><Alert tone="warn" title="Protótipo — medições indicativas, não validadas">Nenhuma medição deste módulo deve ser usada como precisa até existir validação registada para o dispositivo e o método em uso (separador Validação). A captura AR directa não foi testada em telemóvel real pelos autores deste protótipo.</Alert></div>
      <Tabs label="Secções do SMART HOLD SCAN" value={tab} onChange={setTab} tabs={[{ id: 'sensores', label: 'Sensores' }, { id: 'digitalizar', label: 'Digitalizar' }, { id: 'modelo', label: 'Modelo 3D' }, { id: 'validacao', label: 'Validação de precisão' }, { id: 'ajuda', label: 'Limitações' }]} />
      <TabPanel id="sensores" active={tab === 'sensores'}><SensorsTab /></TabPanel>
      <TabPanel id="digitalizar" active={tab === 'digitalizar'}><ScanTab onLoaded={open} /></TabPanel>
      <TabPanel id="modelo" active={tab === 'modelo'}><ModelTab loaded={loaded} measures={measures} setMeasures={setMeasures} mapId={params.get('mapa')} goScan={() => setTab('digitalizar')} useInValidation={(i) => { setPrefill(i); setTab('validacao') }} /></TabPanel>
      <TabPanel id="validacao" active={tab === 'validacao'}><ValidationTab loaded={loaded} prefill={prefill !== null ? measures[prefill]?.distance ?? null : null} /></TabPanel>
      <TabPanel id="ajuda" active={tab === 'ajuda'}><Help /></TabPanel>
    </>
  )
}

/* ------------------------------------------------------------ Sensores */
function SensorsTab() {
  const [caps, setCaps] = useState<ScanCapabilities | null>(null)
  const [cam, setCam] = useState<{ on: boolean; info?: Record<string, unknown>; err?: string }>({ on: false })
  const [probe, setProbe] = useState<{ ok: boolean; features: string[]; error?: string } | null>(null)
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null)
  useEffect(() => { detectCapabilities().then(setCaps); return () => stream.current?.getTracks().forEach((t) => t.stop()) }, [])
  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false }); stream.current = s
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined) }
      const t = s.getVideoTracks()[0]; const caps = (t.getCapabilities?.() ?? {}) as Record<string, unknown>
      setCam({ on: true, info: { rótulo: t.label, ...t.getSettings(), zoom: caps.zoom ? 'sim' : 'não indicado', focoContínuo: Array.isArray(caps.focusMode) ? caps.focusMode.join(', ') : 'não indicado' } })
    } catch (e) { setCam({ on: false, err: (e as Error).name === 'NotAllowedError' ? 'Permissão da câmara recusada ou bloqueada (se esta página estiver embebida, abra-a directamente no navegador).' : (e as Error).message }) }
  }
  const stopCam = () => { stream.current?.getTracks().forEach((t) => t.stop()); setCam({ on: false }) }
  if (!caps) return <Spinner label="A detectar sensores…" />
  const yes = (b: boolean | null) => (b === null ? <Badge>Não testado</Badge> : b ? <Badge tone="ok">Sim</Badge> : <Badge tone="danger">Não</Badge>)
  const rows: [string, React.ReactNode][] = [
    ['Plataforma', <Badge key="p" tone="info">{caps.platform}</Badge>], ['Contexto seguro (HTTPS)', yes(caps.secureContext)], ['API de câmara', yes(caps.camera.api)], ['Câmaras detectadas', caps.camera.devices ?? 'desconhecido'],
    ['WebXR (API)', yes(caps.webxr.api)], ['WebXR AR (immersive-ar)', yes(caps.webxr.immersiveAr)], ['WebGL2 (visualizador 3D)', yes(caps.webgl2)],
    ['Acelerómetro/giroscópio (eventos)', yes(caps.motion.deviceMotion)], ['Orientação do dispositivo', yes(caps.motion.deviceOrientation)], ['Generic Sensor API', caps.motion.genericSensors.join(', ') || 'nenhum'],
    ['LiDAR / ToF', <Badge key="l">Não detectável no navegador</Badge>],
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card card-pad"><h2 className="section-title mb-3 flex items-center gap-2"><Smartphone className="h-5 w-5" aria-hidden />Sensores e capacidades</h2>
        <dl className="divide-y divide-line">{rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 py-2 text-[15px]"><dt className="text-ink-soft">{k}</dt><dd className="text-right font-semibold text-navy">{v}</dd></div>)}</dl>
        <p className="mt-3 text-sm text-ink-soft">{caps.lidar.note}</p>
        {caps.limits.map((l) => <div key={l} className="mt-2"><Alert tone="warn">{l}</Alert></div>)}
      </section>
      <section className="card card-pad"><h2 className="section-title mb-3">Métodos disponíveis neste dispositivo</h2>
        <ul className="space-y-2">{caps.methods.map((m) => <li key={m.id} className="rounded-lg border border-line p-3"><p className="flex items-center justify-between gap-2 font-semibold text-navy">{SCAN_METHOD_LABEL[m.id]}<Badge tone={m.available === 'sim' ? 'ok' : m.available === 'provavel' ? 'info' : 'danger'}>{m.available === 'sim' ? 'Disponível' : m.available === 'provavel' ? 'Provável' : 'Indisponível'}</Badge></p><p className="mt-1 text-sm text-ink-soft">{m.why}</p></li>)}</ul>
        <div className="mt-4"><Button variant="secondary" onClick={async () => setProbe(await probeXRFeatures())} disabled={!caps.webxr.immersiveAr}>Testar funcionalidades AR (abre e fecha uma sessão)</Button>
          {probe && <div className="mt-2">{probe.ok ? <Alert tone="ok" title="Sessão AR aberta">Funcionalidades concedidas: {probe.features.join(', ') || 'nenhuma indicada'}. {probe.features.includes('depth-sensing') ? 'Profundidade disponível.' : 'Profundidade NÃO concedida: só medição por pontos.'}</Alert> : <Alert tone="danger" title="Sessão AR recusada">{probe.error}</Alert>}</div>}</div>
      </section>
      <section className="card card-pad lg:col-span-2"><h2 className="section-title mb-3 flex items-center gap-2"><Camera className="h-5 w-5" aria-hidden />Pré-visualização da câmara</h2>
        <div className="flex flex-wrap gap-2">{cam.on ? <Button variant="secondary" onClick={stopCam}>Desligar câmara</Button> : <Button onClick={startCam}>Ligar câmara traseira</Button>}</div>
        {cam.err && <div className="mt-3"><Alert tone="danger">{cam.err}</Alert></div>}
        <div className={cam.on ? 'mt-3 grid gap-4 md:grid-cols-2' : 'hidden'}><video ref={video} playsInline muted autoPlay className="w-full rounded-card bg-black" aria-label="Pré-visualização da câmara" />
          {cam.info && <dl className="text-sm">{Object.entries(cam.info).map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-line py-1"><dt className="text-ink-soft">{k}</dt><dd className="font-semibold">{String(v)}</dd></div>)}</dl>}</div>
        <p className="mt-3 text-sm text-ink-mute">A câmara sozinha não produz medidas 3D fiáveis: serve de pré-visualização e para fotografias de apoio. A reconstrução precisa de profundidade (LiDAR/ARCore Depth) ou de fotogrametria com escala conhecida.</p>
      </section>
    </div>
  )
}

/* ---------------------------------------------------------- Digitalizar */
function ScanTab({ onLoaded }: { onLoaded: (l: Loaded) => void }) {
  const a = useAuth(), toast = useToast(), qc = useQueryClient()
  const overlay = useRef<HTMLDivElement>(null), ctl = useRef<XRController | null>(null)
  const [ar, setAr] = useState<{ on: boolean; markers: number; frames: number; points: number; status: string }>({ on: false, markers: 0, frames: 0, points: 0, status: '' })
  const [wantDepth, setWantDepth] = useState(true), [busy, setBusy] = useState(''), [scale, setScale] = useState('1')
  const [box, setBox] = useState({ length: '12', width: '8', height: '6' }), [preset, setPreset] = useState('0')
  const scans = useQuery({ queryKey: ['scans'], queryFn: listScans, enabled: a.can(P.scanView) })
  const startAR = async () => {
    if (!overlay.current) return
    setAr({ on: true, markers: 0, frames: 0, points: 0, status: 'A iniciar sessão AR…' })
    try {
      ctl.current = await startXRCapture(overlay.current, wantDepth, { onStatus: (s) => setAr((x) => ({ ...x, status: s })), onMarker: (n) => setAr((x) => ({ ...x, markers: n })), onDepth: (f, p) => setAr((x) => ({ ...x, frames: f, points: p })) }, (r) => {
        setAr((x) => ({ ...x, on: false })); ctl.current = null
        const pts = r.cloud ? r.cloud.positions : Float32Array.from(r.markers.flat())
        if (!pts.length) { toast.error('Sessão terminada sem pontos capturados.'); return }
        onLoaded({ model: { positions: pts, sourceFormat: 'ar' }, title: `Captura AR ${new Date().toLocaleString('pt-PT')}`, method: r.cloud && r.cloud.positions.length > 600 ? 'webxr_depth' : 'webxr_hit_test', markers: r.markers, extra: { funcionalidades: r.features, framesProfundidade: r.depthFrames, duracaoS: r.durationS } })
      })
    } catch (e) { setAr((x) => ({ ...x, on: false })); toast.error(`Não foi possível iniciar a sessão AR: ${(e as Error).message}`) }
  }
  const onFile = async (f: File | null) => {
    if (!f) return; setBusy('A ler o ficheiro…')
    try {
      const ext = f.name.split('.').pop()?.toLowerCase(); let m: ModelData
      if (ext === 'ply') m = parsePLY(await f.arrayBuffer()); else if (ext === 'obj') m = parseOBJ(await f.text()); else if (ext === 'glb' || ext === 'gltf') m = await parseGLB(await f.arrayBuffer()); else throw new Error('Formato não suportado. Use PLY, OBJ ou GLB.')
      const k = Number(scale) || 1; if (k !== 1) m = { ...m, positions: m.positions.map((x) => x * k) }
      onLoaded({ model: m, title: f.name, method: 'imported_model', markers: [], fileName: f.name, extra: { escalaAplicada: k } })
    } catch (e) { toast.error((e as Error).message) } finally { setBusy('') }
  }
  const simulate = () => {
    setBusy('A gerar espaço de teste simulado…')
    setTimeout(() => {
      const spec: BoxSpec = { length: Number(box.length), width: Number(box.width), height: Number(box.height) }
      const noise = DEFAULT_CASES[Number(preset)]
      const sc = generateSyntheticScan(spec, { noise: noise.noise, seed: Date.now() % 1000 })
      onLoaded({ model: { positions: sc.cloud.positions, sourceFormat: 'synthetic' }, title: `SIMULADO ${spec.length}×${spec.width}×${spec.height} m — ${noise.name}`, method: 'simulated', markers: [], truth: sc.truth, simLabel: noise.name, extra: { semente: sc.params.seed, frames: sc.frames, pontosBrutos: sc.rawPoints } }); setBusy('')
    }, 30)
  }
  const open = useMutation({ mutationFn: async (s: HoldScan) => { if (!s.model_path || s.model_format !== 'ply') throw new Error('Só é possível reabrir modelos PLY guardados.'); return { s, m: parsePLY(await downloadScanModel(s.model_path)) } }, onSuccess: ({ s, m }) => onLoaded({ model: m, title: s.title, method: s.method, markers: [] }), onError: (e) => toast.error(friendlyError(e)) })
  const cols: Column<HoldScan>[] = [
    { key: 't', header: 'Digitalização', cell: (s) => <div><span className="font-semibold">{s.title}</span><p className="text-xs text-ink-mute">{SCAN_METHOD_LABEL[s.method]}</p></div> }, { key: 'd', header: 'Data', cell: (s) => formatDateTime(s.created_at) },
    { key: 'f', header: 'Ficheiro', cell: (s) => (s.model_bytes ? `${s.model_format?.toUpperCase()} · ${formatBytes(s.model_bytes)}` : '—') },
    { key: 'a', header: '', cell: (s) => <Button variant="secondary" small loading={open.isPending && open.variables?.id === s.id} disabled={!s.model_path} onClick={() => open.mutate(s)}>Abrir</Button> },
  ]
  void qc
  return (
    <div className="space-y-6">
      {busy && <Spinner label={busy} />}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card card-pad flex flex-col"><h2 className="section-title mb-1 flex items-center gap-2"><Radar className="h-5 w-5" aria-hidden />Captura AR (WebXR)</h2><Badge tone="warn">Não testada em telemóvel real</Badge>
          <p className="my-3 flex-1 text-[15px] text-ink-soft">Android com Chrome/Edge e ARCore: aponte, toque para marcar pontos (cantos do porão) e, se o telemóvel o permitir, acumule profundidade. As medidas são reais em metros, mas a precisão está por validar.</p>
          <label className="mb-3 flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-[18px] w-[18px] accent-brand-700" checked={wantDepth} onChange={(e) => setWantDepth(e.target.checked)} />Pedir profundidade (se disponível)</label>
          <Button onClick={startAR} disabled={ar.on || !a.can(P.scanCapture)}>Iniciar captura AR</Button>{ar.status && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{ar.status}</p>}
        </section>
        <section className="card card-pad flex flex-col"><h2 className="section-title mb-1 flex items-center gap-2"><FileUp className="h-5 w-5" aria-hidden />Importar modelo 3D</h2><Badge tone="ok">Funciona em Android, iOS e computador</Badge>
          <p className="my-3 flex-1 text-[15px] text-ink-soft">Digitalize com uma app de LiDAR/fotogrametria (iPhone/iPad Pro, ARCore…) e importe o ficheiro <strong>PLY, OBJ ou GLB</strong>. Confirme a unidade: assume-se o metro.</p>
          <Field label="Factor de escala (1 = metros; 0,001 = mm; 0,01 = cm)">{(i) => <Input id={i} inputMode="decimal" value={scale} onChange={(e) => setScale(e.target.value)} />}</Field>
          <label className="btn-primary mt-3 cursor-pointer"><input type="file" accept=".ply,.obj,.glb,.gltf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />Escolher ficheiro</label>
        </section>
        <section className="card card-pad flex flex-col"><h2 className="section-title mb-1 flex items-center gap-2"><FlaskConical className="h-5 w-5" aria-hidden />Espaço de teste simulado</h2><Badge tone="info">Apenas testa o algoritmo</Badge>
          <p className="my-3 text-[15px] text-ink-soft">Gera um espaço com medidas exactas e ruído hipotético. <strong>Não é uma digitalização real nem mede a precisão de nenhum telemóvel.</strong></p>
          <div className="grid grid-cols-3 gap-2">{(['length', 'width', 'height'] as const).map((k) => <Field key={k} label={k === 'length' ? 'Comp. (m)' : k === 'width' ? 'Larg. (m)' : 'Alt. (m)'}>{(i) => <Input id={i} inputMode="decimal" value={box[k]} onChange={(e) => setBox({ ...box, [k]: e.target.value })} />}</Field>)}</div>
          <Field label="Ruído simulado" className="mt-2">{(i) => <Select id={i} value={preset} onChange={(e) => setPreset(e.target.value)}>{DEFAULT_CASES.map((c, k) => <option key={c.name} value={k}>{c.name}</option>)}</Select>}</Field>
          <Button className="mt-3" onClick={simulate} disabled={!(Number(box.length) > 1 && Number(box.width) > 1 && Number(box.height) > 1)}>Gerar e visualizar</Button>
        </section>
      </div>
      {a.can(P.scanView) && <section><h2 className="section-title mb-2">Digitalizações guardadas</h2>{scans.isLoading ? <Spinner /> : <DataTable rows={scans.data ?? []} columns={cols} rowKey={(s) => s.id} caption="Digitalizações guardadas" empty={<EmptyState title="Sem digitalizações guardadas">Guarde um modelo no separador «Modelo 3D».</EmptyState>} />}</section>}
      {/* Raiz do overlay AR: fora do ecrã; o navegador mostra-a em ecrã inteiro durante a sessão. */}
      <div ref={overlay} style={{ position: 'fixed', left: -9999, top: 0, width: 320, color: '#fff', fontFamily: 'system-ui', padding: 12 }} aria-hidden={!ar.on}>
        <div style={{ background: 'rgba(10,30,69,.85)', borderRadius: 12, padding: 12 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>SMART HOLD SCAN — AR</p><p style={{ margin: '4px 0' }}>Pontos marcados: {ar.markers} · Profundidade: {ar.frames} frames / {ar.points} pts</p>
          <p style={{ margin: '4px 0', fontSize: 12 }}>Aponte ao canto do porão e toque no ecrã quando o anel azul estiver sobre o ponto. Sugestão: canto A do piso, canto B (lado comprido), canto C (lado largo), ponto no tecto acima do canto A.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#FFC107', fontWeight: 700 }} onClick={() => ctl.current?.addMarker()}>Marcar ponto</button>
            <button style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#fff' }} onClick={() => ctl.current?.undoMarker()}>Desfazer</button>
            <button style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#f87171', fontWeight: 700 }} onClick={() => ctl.current?.stop()}>Concluir</button>
          </div></div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Modelo 3D */
function ModelTab({ loaded, measures, setMeasures, mapId, goScan, useInValidation }: { loaded: Loaded | null; measures: Measurement[]; setMeasures: (m: Measurement[]) => void; mapId: string | null; goScan: () => void; useInValidation: (i: number) => void }) {
  const a = useAuth(), toast = useToast(), qc = useQueryClient()
  const [room, setRoom] = useState<RoomEstimate | null>(null), [busy, setBusy] = useState(false), [hold, setHold] = useState(''), [notes, setNotes] = useState('')
  useEffect(() => { setRoom(null) }, [loaded])
  const stats = useMemo(() => {
    if (!loaded) return null
    const n = countPoints(loaded.model), bb = bbox(loaded.model), tri = loaded.model.indices ? loaded.model.indices.length / 3 : 0
    const vol = loaded.model.indices ? meshVolume(loaded.model.positions, loaded.model.indices) : null
    return { n, bb, tri, vol }
  }, [loaded])
  const wizard = useMemo(() => {
    const m = loaded?.markers; if (!m || m.length < 4) return null
    const h = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[2] - q[2])
    return { length: h(m[0], m[1]), width: h(m[1], m[2]), height: Math.abs(m[3][1] - m[0][1]) }
  }, [loaded])
  const saveM = useMutation({
    mutationFn: () => saveScan({ orgId: a.activeMembership!.organization_id, userId: a.ctx!.profile.id, mapId, title: loaded!.title.slice(0, 120), holdRef: hold, method: loaded!.method, notes, device: { dispositivo: shortDevice(), navegador: navigator.userAgent, ...loaded!.extra }, stats: { pontos: stats!.n, caixaEnvolvente_m: stats!.bb.size.map((x) => +x.toFixed(3)), triangulos: stats!.tri, estimativaPlanos_m: room?.planeDims.map((x) => +x.toFixed(3)) ?? null, simulado: loaded!.method === 'simulated' }, model: { data: writePLY(loaded!.model), format: 'ply' } }),
    onSuccess: () => { toast.success('Digitalização guardada.'); qc.invalidateQueries({ queryKey: ['scans'] }); qc.invalidateQueries({ queryKey: ['audit'] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  if (!loaded || !stats) return <div className="card"><EmptyState icon={<Radar />} title="Ainda não há modelo" action={<Button onClick={goScan}>Ir para Digitalizar</Button>}>Capture, importe ou gere um espaço de teste para o ver aqui.</EmptyState></div>
  const estimate = () => { setBusy(true); setTimeout(() => { try { setRoom(estimateRoom(voxelDownsample({ positions: loaded.model.positions }, Math.max(0.05, Math.max(...stats.bb.size) / 250)))) } finally { setBusy(false) } }, 30) }
  const t = loaded.truth
  const truthSorted = t ? [t.length, t.width, t.height].sort((x, y) => y - x) : null
  const dl = (kind: 'ply' | 'obj' | 'json') => {
    const base = loaded.title.replace(/[^\w.-]+/g, '_').slice(0, 60)
    if (kind === 'ply') save(`${base}.ply`, writePLY(loaded.model), 'application/octet-stream')
    else if (kind === 'obj') save(`${base}.obj`, writeOBJ(loaded.model), 'text/plain')
    else save(`${base}.json`, JSON.stringify({ aviso: 'Medições indicativas, NÃO validadas.', gerado_em: new Date().toISOString(), titulo: loaded.title, metodo: loaded.method, simulado: loaded.method === 'simulated', dispositivo: shortDevice(), pontos: stats.n, triangulos: stats.tri, caixa_envolvente_m: stats.bb.size, volume_malha_m3: stats.vol && stats.vol.watertight ? stats.vol.volume : null, malha_fechada: stats.vol?.watertight ?? null, estimativa_espaco: room, medicoes: measures, assistente_pontos: wizard, ...loaded.extra }, null, 2), 'application/json')
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0"><Viewer3D model={loaded.model} markers={loaded.markers} measurements={measures} onMeasure={(m) => setMeasures([...measures, m])} onClearMeasurements={() => setMeasures([])} /></div>
      <aside className="space-y-4">
        <div className="card card-pad"><h2 className="section-title mb-1 break-words !text-base">{loaded.title}</h2><p className="flex flex-wrap gap-1.5"><Badge tone={loaded.method === 'simulated' ? 'info' : 'neutral'}>{SCAN_METHOD_LABEL[loaded.method]}</Badge><Badge tone="warn">Indicativo — não validado</Badge></p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-ink-mute">Pontos</dt><dd className="font-semibold">{stats.n.toLocaleString('pt-PT')}</dd></div>{stats.tri > 0 && <div><dt className="text-ink-mute">Triângulos</dt><dd className="font-semibold">{stats.tri.toLocaleString('pt-PT')}</dd></div>}
            <div className="col-span-2"><dt className="text-ink-mute">Caixa envolvente (eixos do modelo)</dt><dd className="font-semibold tabular-nums">{stats.bb.size.map((x) => formatNumber(x, 2)).join(' × ')} m</dd></div></dl>
          {stats.vol && <p className="mt-2 text-sm text-ink-soft">{stats.vol.watertight ? `Malha fechada: volume geométrico ${formatNumber(stats.vol.volume, 3)} m³ (do modelo; não é volume de carga).` : 'Malha aberta: o volume não é fiável e não é apresentado.'}</p>}
        </div>
        <div className="card card-pad"><h2 className="section-title mb-2 !text-base">Medições</h2>
          {measures.length === 0 ? <p className="text-sm text-ink-soft">Active «Medir entre 2 pontos» e toque em dois pontos do modelo.</p> : <ul className="space-y-2">{measures.map((m, i) => <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2"><span className="font-semibold tabular-nums text-navy">{formatNumber(m.distance, 3)} m</span>{a.can(P.scanValidate) && <Button variant="secondary" small onClick={() => useInValidation(i)}>Usar na validação</Button>}</li>)}</ul>}
          {wizard && <div className="mt-3 rounded-lg border border-line p-3 text-sm"><p className="font-semibold text-navy">Porão rectangular (4 pontos)</p><p className="tabular-nums">Comprimento {formatNumber(wizard.length, 3)} m · Largura {formatNumber(wizard.width, 3)} m · Altura {formatNumber(wizard.height, 3)} m</p><p className="text-ink-mute">Aproximação por caixa: ignora tremonhas e estruturas.</p></div>}
        </div>
        {stats.n >= 300 && <div className="card card-pad"><h2 className="section-title mb-2 !text-base">Estimativa do espaço</h2><Button variant="secondary" small loading={busy} onClick={estimate}>Estimar dimensões (planos)</Button>
          {room && <div className="mt-3 text-sm"><p>Método: <strong>{room.method === 'planos' ? 'pares de planos paralelos' : 'caixa envolvente orientada'}</strong> ({room.planesFound} planos)</p><p className="font-semibold tabular-nums text-navy">{(room.method === 'planos' ? room.planeDims : room.obbDims).map((x) => formatNumber(x, 3)).join(' × ')} m</p>{room.planeRms.length > 0 && <p className="text-ink-mute">Resíduo RMS dos planos: {room.planeRms.map((x) => `${(x * 100).toFixed(1)} cm`).join(', ')}</p>}
            {truthSorted && <table className="mt-2 w-full text-left"><caption className="sr-only">Comparação com o espaço simulado</caption><thead><tr><th className="py-1">Verdade</th><th>Estimado</th><th>Erro</th></tr></thead><tbody>{(room.method === 'planos' ? room.planeDims : room.obbDims).map((d, i) => <tr key={i}><td className="tabular-nums">{formatNumber(truthSorted[i], 3)}</td><td className="tabular-nums">{formatNumber(d, 3)}</td><td className="tabular-nums">{formatNumber(((d - truthSorted[i]) / truthSorted[i]) * 100, 2)} %</td></tr>)}</tbody></table>}
            {loaded.simLabel && <p className="mt-1 text-xs text-ink-mute">SIMULAÇÃO ({loaded.simLabel}): testa o algoritmo, não um telemóvel.</p>}{room.notes.map((n) => <p key={n} className="mt-1 text-xs text-ink-mute">{n}</p>)}</div>}</div>}
        <div className="card card-pad"><h2 className="section-title mb-2 !text-base">Exportar</h2><div className="flex flex-wrap gap-2"><Button variant="secondary" small onClick={() => dl('ply')}><Download className="h-4 w-4" aria-hidden />PLY</Button><Button variant="secondary" small onClick={() => dl('obj')}><Download className="h-4 w-4" aria-hidden />OBJ</Button><Button variant="secondary" small onClick={() => dl('json')}><Download className="h-4 w-4" aria-hidden />Relatório JSON</Button></div></div>
        {a.can(P.scanCapture) && a.activeMembership && <div className="card card-pad space-y-3"><h2 className="section-title !text-base">Guardar digitalização</h2>
          {mapId && <Alert tone="info">Será associada ao mapa de inspecção seleccionado.</Alert>}
          <Field label="Porão / local">{(i) => <Input id={i} value={hold} onChange={(e) => setHold(e.target.value)} />}</Field><Field label="Notas">{(i) => <Textarea id={i} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          <Button loading={saveM.isPending} onClick={() => saveM.mutate()}><Save className="h-4 w-4" aria-hidden />Guardar no sistema</Button></div>}
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------ Validação */
function ValidationTab({ loaded, prefill }: { loaded: Loaded | null; prefill: number | null }) {
  const a = useAuth(), toast = useToast(), qc = useQueryClient()
  const vals = useQuery({ queryKey: ['validations'], queryFn: listValidations, enabled: a.can(P.scanView) }), crit = useQuery({ queryKey: ['scan-criteria'], queryFn: getCriteria }), scans = useQuery({ queryKey: ['scans'], queryFn: listScans, enabled: a.can(P.scanView) })
  const [f, setF] = useState({ device: shortDevice(), method: (loaded?.method ?? 'imported_model') as ScanMethod, ref: '', physical: '', instrument: '', uncertainty: '', scanned: '', scanId: '', conditions: '' })
  useEffect(() => { if (prefill !== null) setF((x) => ({ ...x, scanned: String(+prefill.toFixed(4)) })) }, [prefill])
  const add = useMutation({
    mutationFn: () => addValidation({ orgId: a.activeMembership!.organization_id, userId: a.ctx!.profile.id, scanId: f.scanId || null, deviceLabel: f.device, method: f.method, reference: f.ref, physical: Number(f.physical), instrument: f.instrument, uncertainty: f.uncertainty === '' ? null : Number(f.uncertainty), scanned: Number(f.scanned), conditions: f.conditions }),
    onSuccess: () => { toast.success('Medição de validação registada (não pode ser alterada).'); setF({ ...f, ref: '', physical: '', scanned: '' }); qc.invalidateQueries({ queryKey: ['validations'] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const [sim, setSim] = useState<SimRow[] | null>(null), [simBusy, setSimBusy] = useState(false)
  const groups = useMemo(() => { const s: ValidationSample[] = (vals.data ?? []).map((v: ScanValidation) => ({ scan_id: v.scan_id, reference_label: v.reference_label, physical: Number(v.physical_value), scanned: Number(v.scanned_value), device_label: v.device_label, method: v.method })); return [...groupByConfig(s).entries()].map(([k, arr]) => ({ k, arr, ev: evaluateValidation(arr, crit.data) })) }, [vals.data, crit.data])
  const ok = Number(f.physical) > 0 && Number(f.scanned) > 0 && f.ref.trim().length >= 2 && f.device.trim().length >= 2
  const cols: Column<ScanValidation>[] = [
    { key: 'd', header: 'Data', cell: (v) => formatDateTime(v.measured_at) }, { key: 'v', header: 'Dispositivo / método', cell: (v) => <div>{v.device_label}<p className="text-xs text-ink-mute">{SCAN_METHOD_LABEL[v.method]}</p></div> }, { key: 'r', header: 'Referência', cell: (v) => <div>{v.reference_label}{v.physical_instrument && <p className="text-xs text-ink-mute">{v.physical_instrument}{v.physical_uncertainty != null ? ` ±${v.physical_uncertainty} m` : ''}</p>}</div> },
    { key: 'p', header: 'Físico (m)', align: 'right', cell: (v) => formatNumber(Number(v.physical_value), 3) }, { key: 's', header: 'Digitalizado (m)', align: 'right', cell: (v) => formatNumber(Number(v.scanned_value), 3) },
    { key: 'e', header: 'Erro', align: 'right', cell: (v) => `${Number(v.error_abs) > 0 ? '+' : ''}${formatNumber(Number(v.error_abs), 3)} m (${formatNumber(Number(v.error_pct), 2)} %)` },
  ]
  return (
    <div className="space-y-6">
      <Alert tone="info" title="Como validar">Meça a mesma dimensão com um instrumento de referência (trena de aço, medidor laser calibrado) e com o modelo. Registe várias dimensões, em várias digitalizações e condições. Os registos não se alteram nem se apagam. Só há veredicto com amostras suficientes — e mesmo assim os critérios abaixo são <strong>provisórios</strong>.</Alert>
      {crit.data && <p className="text-sm text-ink-soft">Critérios mínimos (provisórios, a definir pela direcção técnica): ≥ {crit.data.min_samples} medições · ≥ {crit.data.min_distinct_scans} digitalizações distintas · erro médio absoluto ≤ {crit.data.max_mean_abs_error_pct} % · erro máximo ≤ {crit.data.max_single_error_pct} %.</p>}
      <section className="grid gap-4 lg:grid-cols-3">{groups.length === 0 ? <div className="card lg:col-span-3"><EmptyState title="Sem validação">Nenhum dispositivo/método tem medições de validação registadas. Todas as medições são indicativas.</EmptyState></div> : groups.map((g) => { const L = VERDICT_LABEL[g.ev.verdict], st = g.ev.stats; const [dev, met] = g.k.split('|'); return (
        <article key={g.k} className="card card-pad"><p className="font-semibold text-navy">{dev}</p><p className="text-xs text-ink-mute">{SCAN_METHOD_LABEL[met as ScanMethod]}</p><p className="my-2"><Badge tone={L.tone}>{L.text}</Badge></p>
          <dl className="grid grid-cols-2 gap-1 text-sm"><dt className="text-ink-mute">Medições</dt><dd className="text-right font-semibold">{st.n}</dd><dt className="text-ink-mute">Digitalizações</dt><dd className="text-right font-semibold">{st.distinctScans}</dd><dt className="text-ink-mute">Erro médio abs.</dt><dd className="text-right font-semibold">{st.meanAbsPct} %</dd><dt className="text-ink-mute">Erro máximo</dt><dd className="text-right font-semibold">{st.maxAbsPct} %</dd><dt className="text-ink-mute">Viés</dt><dd className="text-right font-semibold">{st.biasPct} %</dd><dt className="text-ink-mute">RMSE</dt><dd className="text-right font-semibold">{st.rmsePct} %</dd></dl>
          {g.ev.reasons.map((r) => <p key={r} className="mt-2 text-xs text-ink-soft">{r}</p>)}</article>) })}</section>
      {a.can(P.scanValidate) && a.activeMembership && (
        <section className="card card-pad"><h2 className="section-title mb-3">Registar medição de validação</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Dispositivo" required>{(i) => <Input id={i} value={f.device} onChange={(e) => setF({ ...f, device: e.target.value })} />}</Field>
            <Field label="Método">{(i) => <Select id={i} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as ScanMethod })}>{(Object.keys(SCAN_METHOD_LABEL) as ScanMethod[]).map((m) => <option key={m} value={m}>{SCAN_METHOD_LABEL[m]}</option>)}</Select>}</Field>
            <Field label="Digitalização (opcional)">{(i) => <Select id={i} value={f.scanId} onChange={(e) => setF({ ...f, scanId: e.target.value })}><option value="">—</option>{scans.data?.map((s) => <option key={s.id} value={s.id}>{s.title.slice(0, 50)}</option>)}</Select>}</Field>
            <Field label="Dimensão medida" required hint="Ex.: largura entre antepara A e B">{(i) => <Input id={i} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} />}</Field>
            <Field label="Valor físico (m)" required>{(i) => <Input id={i} inputMode="decimal" value={f.physical} onChange={(e) => setF({ ...f, physical: e.target.value })} />}</Field>
            <Field label="Valor digitalizado (m)" required>{(i) => <Input id={i} inputMode="decimal" value={f.scanned} onChange={(e) => setF({ ...f, scanned: e.target.value })} />}</Field>
            <Field label="Instrumento de referência">{(i) => <Input id={i} value={f.instrument} onChange={(e) => setF({ ...f, instrument: e.target.value })} placeholder="Trena de aço, medidor laser…" />}</Field>
            <Field label="Incerteza do instrumento (m)">{(i) => <Input id={i} inputMode="decimal" value={f.uncertainty} onChange={(e) => setF({ ...f, uncertainty: e.target.value })} />}</Field>
            <Field label="Condições">{(i) => <Input id={i} value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} placeholder="Luz, poeira, distância, tempo de captura…" />}</Field>
          </div><div className="mt-4"><Button loading={add.isPending} disabled={!ok} onClick={() => add.mutate()}>Registar medição</Button></div></section>)}
      <section><h2 className="section-title mb-2">Registos de validação</h2>{vals.isLoading ? <Spinner /> : <DataTable rows={vals.data ?? []} columns={cols} rowKey={(v) => v.id} caption="Registos de validação" empty={<EmptyState title="Sem registos" />} />}</section>
      <section className="card card-pad"><h2 className="section-title mb-1">Teste do algoritmo (simulado)</h2><p className="mb-3 max-w-3xl text-[15px] text-ink-soft">Corre o algoritmo de reconstrução sobre um espaço sintético de 12 × 8 × 6 m com ruídos <strong>hipotéticos</strong>. Mostra como o método reage a ruído, falhas, erro de escala e deriva — <strong>não</strong> a precisão de nenhum telemóvel.</p>
        <Button variant="secondary" loading={simBusy} onClick={() => { setSimBusy(true); setTimeout(() => { setSim(runSimulationSuite()); setSimBusy(false) }, 30) }}>Executar suite de simulação</Button>
        {sim && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-[15px]"><caption className="sr-only">Resultados da simulação</caption><thead><tr><th className="th">Cenário (SIMULADO)</th><th className="th">Método</th><th className="th text-right">Erro por dimensão (%)</th><th className="th text-right">Média</th><th className="th text-right">Máx.</th></tr></thead><tbody>{sim.map((r) => <tr key={r.name}><td className="td">{r.name}</td><td className="td">{r.method}</td><td className="td text-right tabular-nums">{r.errPct.join(' / ')}</td><td className="td text-right tabular-nums">{r.meanAbsPct}</td><td className="td text-right tabular-nums">{r.maxAbsPct}</td></tr>)}</tbody></table>
          <p className="mt-2 text-xs text-ink-mute">Um erro de escala sistemático propaga-se por inteiro e o algoritmo não o detecta: é por isso que a validação com medidas físicas é indispensável.</p></div>}</section>
    </div>
  )
}

function Help() {
  const items: [string, string][] = [
    ['Escala e deriva', 'Fotogrametria sem referência não tem escala absoluta; LiDAR e ARCore acumulam deriva em percursos longos. Num porão de dezenas de metros, o erro pode ser muito superior ao de uma sala.'],
    ['Alcance', 'Os LiDAR de telemóvel têm alcance útil curto (cerca de 5 m nos estudos consultados). Porões grandes obrigam a várias estações e a juntar digitalizações — o que aumenta o erro.'],
    ['Superfícies', 'Metal brilhante, escuridão, poeira em suspensão e grão uniforme (sem textura) degradam a profundidade e a fotogrametria.'],
    ['Carga a granel', 'A superfície do cereal não é plana (ângulo de repouso), a densidade varia com a humidade e a compactação, e o volume não é o peso. O cálculo de quantidade exige densidade validada e não substitui o método oficial acordado (por exemplo, o draft survey).'],
    ['iPhone/iPad', 'O Safari não suporta WebXR. Para LiDAR use uma app nativa e importe o modelo aqui; no futuro, uma app/plugin nativo (ARKit) pode integrar-se com este módulo.'],
    ['Validação', 'Nada é «preciso» sem registos de validação: várias dimensões, várias digitalizações e instrumento de referência com incerteza conhecida.'],
  ]
  return <div className="grid max-w-5xl gap-3 md:grid-cols-2">{items.map(([t, d]) => <article key={t} className="card p-4"><h2 className="text-base font-semibold">{t}</h2><p className="mt-1 text-[15px] text-ink-soft">{d}</p></article>)}<p className="text-sm text-ink-mute md:col-span-2">Documentação técnica completa em <code>docs/SMART_HOLD_SCAN/</code> (auditoria, pesquisa tecnológica, protocolo de validação e resultados da simulação).</p></div>
}

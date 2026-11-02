import { describe, expect, it } from 'vitest'
import { DepthFusion, backproject, intrinsicsFromFov, lookAt } from './depth'
import { bbox, eigenSym3, fitPlane, fromPoints, meshVolume, orientedBox, ransacPlane, voxelDownsample, countPoints } from './geometry'
import { parseOBJ, parsePLY, writeOBJ, writePLY } from './io'
import { detectCapabilities } from './capabilities'
import { estimateRoom } from './room'
import { runSimulationSuite } from './simulate'
import { NOISE_NONE, generateSyntheticScan, renderBoxDepth } from './synthetic'
import { DEFAULT_CRITERIA, errorStats, evaluateValidation, groupByConfig } from './validation'
import { seededRng } from './geometry'

const cubeMesh = (s = 1) => ({ positions: Float32Array.from([0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s]), indices: Uint32Array.from([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3]) })

describe('geometria', () => {
  it('valores próprios (Jacobi)', () => {
    const e = eigenSym3([4, 0, 0, 0, 2, 0, 0, 0, 1])
    expect(e.values.map((x) => +x.toFixed(9))).toEqual([4, 2, 1])
    expect(Math.abs(e.vectors[0][0])).toBeCloseTo(1, 9)
  })
  it('ajusta um plano exacto e o RANSAC ignora pontos fora', () => {
    const r = seededRng(5), pts: [number, number, number][] = []
    for (let i = 0; i < 400; i++) pts.push([r() * 10, 2.5, r() * 10]) // plano y = 2,5
    for (let i = 0; i < 60; i++) pts.push([r() * 10, r() * 10, r() * 10]) // ruído
    const pc = fromPoints(pts)
    const f = ransacPlane(pc, { threshold: 0.01, seed: 2 })!
    expect(Math.abs(f.plane.n[1])).toBeGreaterThan(0.9999)
    expect(Math.abs(f.plane.d)).toBeCloseTo(2.5, 3)
    expect(f.inliers.length).toBeGreaterThanOrEqual(400)
    expect(Math.abs(fitPlane(fromPoints(pts.slice(0, 400))).d)).toBeCloseTo(2.5, 6)
  })
  it('caixa orientada de um paralelepípedo rodado', () => {
    const r = seededRng(9), pts: [number, number, number][] = [], a = 0.6, c = Math.cos(a), s = Math.sin(a)
    for (let i = 0; i < 6000; i++) { const x = r() * 12, y = r() * 6, z = r() * 8; pts.push([x * c - z * s, y, x * s + z * c]) }
    const o = orientedBox(fromPoints(pts), 0)
    // O PCA com amostragem finita desalinha ligeiramente os eixos: a caixa envolvente sobrestima um pouco (tolerância 3 %).
    ;[...o.extents].sort((p, q) => q - p).forEach((x, i) => expect(Math.abs(x - [12, 8, 6][i]) / [12, 8, 6][i]).toBeLessThan(0.03))
  })
  it('volume de malha fechada e detecção de malha aberta', () => {
    const c = cubeMesh(2)
    const full = meshVolume(c.positions, c.indices)
    expect(full.volume).toBeCloseTo(8, 9); expect(full.watertight).toBe(true)
    const open = meshVolume(c.positions, c.indices.slice(0, 33))
    expect(open.watertight).toBe(false)
  })
  it('voxel downsample reduz pontos e mantém limites', () => {
    const r = seededRng(1), pts: [number, number, number][] = []
    for (let i = 0; i < 5000; i++) pts.push([r() * 3, r() * 3, r() * 3])
    const d = voxelDownsample(fromPoints(pts), 0.5)
    expect(countPoints(d)).toBeLessThanOrEqual(216)
    expect(bbox(d).size[0]).toBeGreaterThan(2.4)
  })
})

describe('profundidade e fusão', () => {
  it('um plano a 2 m reconstrói-se a z = 2 m', () => {
    const k = intrinsicsFromFov(40, 30, 60), d = new Float32Array(40 * 30).fill(2)
    const pts = backproject(d, k, { position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] })
    expect(pts.length).toBe(1200)
    expect(new Set(pts.map((p) => +p[2].toFixed(6)))).toEqual(new Set([2]))
  })
  it('lookAt orienta o eixo z da câmara para o alvo', () => {
    const p = lookAt([0, 0, 0], [0, 0, 5])
    expect([p.rotation[2], p.rotation[5], p.rotation[8]]).toEqual([0, 0, 1])
  })
  it('raios dentro da caixa terminam nas paredes', () => {
    const k = intrinsicsFromFov(9, 9, 10), box = { length: 10, height: 4, width: 6 }
    const d = renderBoxDepth(box, k, lookAt([5, 2, 3], [10, 2, 3]), NOISE_NONE, seededRng(1))
    expect(d[4 * 9 + 4]).toBeCloseTo(5, 3) // centro: parede a 5 m
    const f = new DepthFusion(); f.addPoints([[0, 0, 0], [0.01, 0, 0]]); expect(countPoints(f.toCloud(0.5))).toBe(1)
  })
})

describe('estimativa do espaço (algoritmo, dados sintéticos)', () => {
  const box = { length: 12, height: 6, width: 8 }
  it('sem ruído recupera as 3 dimensões com erro < 0,5 %', () => {
    const e = estimateRoom(generateSyntheticScan(box).cloud)
    expect(e.method).toBe('planos')
    ;[12, 8, 6].forEach((t, i) => expect(Math.abs(e.planeDims[i] - t) / t * 100).toBeLessThan(0.5))
  })
  it('a suite de simulação tem a ordem de grandeza esperada', () => {
    const rows = runSimulationSuite(box, undefined, [11, 22])
    const by = (n: string) => rows.find((r) => r.name.startsWith(n))!
    expect(by('Ideal').meanAbsPct).toBeLessThan(0.05)
    expect(by('Ruído baixo').meanAbsPct).toBeLessThan(0.2)
    expect(by('Ruído moderado (').meanAbsPct).toBeLessThan(2.5) // com ruído de ~16 cm a 15 m o erro já é de ordem percentual
    // um erro de escala sistemático NÃO é detectável pelo algoritmo e propaga-se por inteiro
    expect(by('Erro de escala').meanAbsPct).toBeGreaterThan(1.7)
    expect(by('Erro de escala').meanAbsPct).toBeLessThan(2.3)
    // a deriva piora o resultado
    expect(by('Deriva de posição 3 cm').meanAbsPct).toBeGreaterThan(by('Deriva de posição 1 cm').meanAbsPct)
  })
})

describe('ficheiros 3D', () => {
  it('PLY binário (ida e volta) com cores e faces', () => {
    const c = cubeMesh(1), colors = new Uint8Array(24).fill(200)
    const back = parsePLY(writePLY({ ...c, colors }))
    expect(Array.from(back.positions)).toEqual(Array.from(c.positions)); expect(back.indices!.length).toBe(36); expect(back.colors![0]).toBe(200)
    expect(meshVolume(back.positions, back.indices!).volume).toBeCloseTo(1, 9)
  })
  it('PLY ASCII com quadrilátero e OBJ com índices negativos', () => {
    const ply = 'ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n4 0 1 2 3\n'
    const m = parsePLY(new TextEncoder().encode(ply).buffer as ArrayBuffer)
    expect(m.positions.length).toBe(12); expect(m.indices!.length).toBe(6)
    const o = parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n')
    expect(Array.from(o.indices!)).toEqual([0, 1, 2])
    expect(writeOBJ({ positions: o.positions, indices: o.indices })).toContain('f 1 2 3')
  })
  it('rejeita ficheiros inválidos', () => {
    expect(() => parsePLY(new TextEncoder().encode('isto não é PLY').buffer as ArrayBuffer)).toThrow(/PLY inválido/)
    expect(() => parseOBJ('# vazio')).toThrow(/sem vértices/)
  })
})

describe('validação estatística de precisão', () => {
  const mk = (ph: number, sc: number, scan: string, dev = 'Tel A') => ({ scan_id: scan, reference_label: 'L', physical: ph, scanned: sc, device_label: dev, method: 'imported_model' })
  it('estatísticas', () => {
    const s = errorStats([mk(4, 4.04, 'a'), mk(4, 3.96, 'b'), mk(10, 10.1, 'c')])
    expect(s).toMatchObject({ n: 3, maxAbsPct: 1, distinctScans: 3 }); expect(s.meanAbsPct).toBeCloseTo(1, 3); expect(s.biasPct).toBeCloseTo(0.333, 3)
  })
  it('sem dados e dados insuficientes nunca são «validados»', () => {
    expect(evaluateValidation([]).verdict).toBe('sem_dados')
    expect(evaluateValidation([mk(4, 4, 'a')]).verdict).toBe('insuficiente')
  })
  it('reprova quando excede os critérios e só «cumpre provisórios» com amostras suficientes', () => {
    const good = Array.from({ length: 10 }, (_, i) => mk(5, 5.01, `s${i % 3}`))
    expect(evaluateValidation(good).verdict).toBe('cumpre_criterios_provisorios')
    expect(evaluateValidation([...good, mk(5, 5.5, 's1')]).verdict).toBe('reprovado') // 10 % de erro numa medição
    expect(evaluateValidation(good.map((x, i) => (i < 5 ? { ...x, scan_id: 's0' } : { ...x, scan_id: 's0' }))).verdict).toBe('insuficiente') // 1 só digitalização
    expect(DEFAULT_CRITERIA.provisional).toBe(true)
  })
  it('agrupa por dispositivo e método', () => {
    expect(groupByConfig([mk(1, 1, 'a'), mk(1, 1, 'b', 'Tel B'), mk(1, 1, 'c')]).size).toBe(2)
  })
})

describe('detecção de capacidades (sem LiDAR detectável no navegador)', () => {
  it('Android com WebXR AR', async () => {
    const c = await detectCapabilities({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)', xr: { isSessionSupported: async () => true }, mediaDevices: { enumerateDevices: async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }], getSupportedConstraints: () => ({}) } }, isSecureContext: true, DeviceMotionEvent: {}, Accelerometer: {}, createWebGL2: () => true })
    expect(c.platform).toBe('android'); expect(c.methods.find((m) => m.id === 'webxr_depth')!.available).toBe('provavel'); expect(c.camera.devices).toBe(2); expect(c.motion.genericSensors).toEqual(['Accelerometer']); expect(c.lidar.detectableInBrowser).toBe(false)
  })
  it('iPhone: sem WebXR, só importação; avisa sobre LiDAR nativo', async () => {
    const c = await detectCapabilities({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }, isSecureContext: true, createWebGL2: () => true })
    expect(c.platform).toBe('ios'); expect(c.methods.find((m) => m.id === 'webxr_depth')!.available).toBe('nao'); expect(c.methods.find((m) => m.id === 'imported_model')!.available).toBe('sim'); expect(c.limits.join(' ')).toMatch(/LiDAR/)
  })
  it('contexto inseguro e página embebida geram avisos', async () => {
    const top = {}, self = {}
    const c = await detectCapabilities({ navigator: { userAgent: 'Android' }, isSecureContext: false, top, self, createWebGL2: () => false })
    expect(c.limits.join(' ')).toMatch(/HTTPS/); expect(c.limits.join(' ')).toMatch(/embebida/); expect(c.limits.join(' ')).toMatch(/WebGL2/)
  })
})

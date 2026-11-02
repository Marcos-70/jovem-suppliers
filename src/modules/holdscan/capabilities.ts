// Detecção de sensores e capacidades. O navegador NÃO expõe LiDAR/ToF directamente: isso só se sabe numa app nativa.
export interface EnvLike {
  navigator?: { userAgent?: string; platform?: string; maxTouchPoints?: number; mediaDevices?: { enumerateDevices?: () => Promise<{ kind: string }[]>; getSupportedConstraints?: () => Record<string, unknown> }; xr?: { isSessionSupported?: (m: string) => Promise<boolean> }; hardwareConcurrency?: number; deviceMemory?: number }
  isSecureContext?: boolean
  DeviceMotionEvent?: unknown; DeviceOrientationEvent?: unknown
  Accelerometer?: unknown; Gyroscope?: unknown; Magnetometer?: unknown; AbsoluteOrientationSensor?: unknown; AmbientLightSensor?: unknown
  createWebGL2?: () => boolean
  top?: unknown; self?: unknown
}
export type MethodId = 'webxr_depth' | 'webxr_hit_test' | 'imported_model'
export interface ScanCapabilities {
  platform: 'android' | 'ios' | 'desktop' | 'other'
  secureContext: boolean; embedded: boolean
  camera: { api: boolean; devices: number | null }
  webxr: { api: boolean; immersiveAr: boolean | null }
  motion: { deviceMotion: boolean; deviceOrientation: boolean; genericSensors: string[] }
  webgl2: boolean
  hardware: { cores: number | null; memoryGb: number | null }
  lidar: { detectableInBrowser: false; note: string }
  methods: { id: MethodId; available: 'sim' | 'provavel' | 'nao'; why: string }[]
  limits: string[]
}

export async function detectCapabilities(env: EnvLike = globalThis as unknown as EnvLike): Promise<ScanCapabilities> {
  const nav = env.navigator ?? {}, ua = nav.userAgent ?? ''
  const platform: ScanCapabilities['platform'] = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) ? 'ios' : /windows|macintosh|linux|cros/i.test(ua) ? 'desktop' : 'other'
  const md = nav.mediaDevices
  let devices: number | null = null
  try { if (md?.enumerateDevices) devices = (await md.enumerateDevices()).filter((d) => d.kind === 'videoinput').length } catch { devices = null }
  let immersiveAr: boolean | null = null
  try { if (nav.xr?.isSessionSupported) immersiveAr = await nav.xr.isSessionSupported('immersive-ar') } catch { immersiveAr = false }
  const generic = ['Accelerometer', 'Gyroscope', 'Magnetometer', 'AbsoluteOrientationSensor', 'AmbientLightSensor'].filter((k) => (env as Record<string, unknown>)[k])
  let webgl2 = false
  try { webgl2 = env.createWebGL2 ? env.createWebGL2() : typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2') } catch { webgl2 = false }
  const embedded = env.top !== undefined && env.self !== undefined && env.top !== env.self
  const cam = !!md?.getSupportedConstraints
  const methods: ScanCapabilities['methods'] = [
    immersiveAr ? { id: 'webxr_depth', available: 'provavel', why: 'WebXR AR disponível. Profundidade só é confirmada ao iniciar a sessão AR (depende do telemóvel).' } : { id: 'webxr_depth', available: 'nao', why: platform === 'ios' ? 'Safari/iOS não suporta WebXR AR. LiDAR exige app nativa.' : 'WebXR AR não disponível neste navegador/dispositivo.' },
    immersiveAr ? { id: 'webxr_hit_test', available: 'provavel', why: 'WebXR AR disponível: medição por pontos (hit-test) provável.' } : { id: 'webxr_hit_test', available: 'nao', why: 'Requer WebXR AR (Chrome/Edge em Android com ARCore).' },
    { id: 'imported_model', available: 'sim', why: 'Funciona em qualquer dispositivo: digitalize com uma app de LiDAR/fotogrametria e importe PLY/OBJ/GLB.' },
  ]
  const limits: string[] = []
  if (!(env.isSecureContext ?? false)) limits.push('Contexto não seguro (sem HTTPS): câmara e AR ficam bloqueadas.')
  if (embedded) limits.push('Página embebida noutra página: o navegador pode bloquear câmara e AR. Abra o endereço da aplicação directamente.')
  if (platform === 'ios') limits.push('iOS: sem WebXR no Safari. Para LiDAR é necessária uma app nativa (ARKit) ou importar modelos exportados por apps de digitalização.')
  if (!webgl2) limits.push('WebGL2 indisponível: o visualizador 3D pode não funcionar.')
  return {
    platform, secureContext: !!env.isSecureContext, embedded, camera: { api: cam, devices }, webxr: { api: !!nav.xr, immersiveAr },
    motion: { deviceMotion: !!env.DeviceMotionEvent, deviceOrientation: !!env.DeviceOrientationEvent, genericSensors: generic }, webgl2,
    hardware: { cores: nav.hardwareConcurrency ?? null, memoryGb: nav.deviceMemory ?? null },
    lidar: { detectableInBrowser: false, note: 'O navegador não permite saber se o telemóvel tem LiDAR/ToF. Consulte o modelo na lista de dispositivos compatíveis.' },
    methods, limits,
  }
}

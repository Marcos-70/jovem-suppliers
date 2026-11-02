import { estimateRoom } from './room'
import { NOISE_NONE, generateSyntheticScan, type BoxSpec, type NoiseSpec } from './synthetic'

export interface SimCase { name: string; noise: NoiseSpec }
export interface SimRow {
  name: string; seeds: number; points: number; method: string
  /** Erro % por dimensão (maior→menor) — média dos valores absolutos nas sementes */
  errPct: number[]; meanAbsPct: number; maxAbsPct: number; volumeErrPct: number
}

export const DEFAULT_CASES: SimCase[] = [
  { name: 'Ideal (sem ruído)', noise: NOISE_NONE },
  { name: 'Ruído baixo (3 mm + 0,2 %)', noise: { ...NOISE_NONE, sigmaConst: 0.003, sigmaFrac: 0.002 } },
  { name: 'Ruído moderado (1 cm + 1 %)', noise: { ...NOISE_NONE, sigmaConst: 0.01, sigmaFrac: 0.01 } },
  { name: 'Ruído moderado + 20 % de falhas', noise: { ...NOISE_NONE, sigmaConst: 0.01, sigmaFrac: 0.01, dropout: 0.2 } },
  { name: 'Erro de escala sistemático +2 %', noise: { ...NOISE_NONE, scaleError: 0.02 } },
  { name: 'Deriva de posição 1 cm/frame', noise: { ...NOISE_NONE, driftPerFrame: 0.01 } },
  { name: 'Deriva de posição 3 cm/frame', noise: { ...NOISE_NONE, driftPerFrame: 0.03 } },
  { name: 'Combinado (1 cm + 1 %, deriva 2 cm/frame, 10 % falhas)', noise: { sigmaConst: 0.01, sigmaFrac: 0.01, dropout: 0.1, scaleError: 0, driftPerFrame: 0.02 } },
]

/**
 * Valida o ALGORITMO (fusão + estimativa de planos) contra um espaço de medidas exactas.
 * É uma SIMULAÇÃO: os ruídos são hipóteses, não medições de um dispositivo real.
 */
export function runSimulationSuite(box: BoxSpec = { length: 12, height: 6, width: 8 }, cases: SimCase[] = DEFAULT_CASES, seeds = [11, 22, 33]): SimRow[] {
  const truth = [box.length, box.width, box.height].sort((a, b) => b - a)
  return cases.map((c) => {
    const errs: number[][] = [], vol: number[] = []; let pts = 0, method = ''
    for (const seed of seeds) {
      const sc = generateSyntheticScan(box, { noise: c.noise, seed })
      const est = estimateRoom(sc.cloud)
      const dims = est.method === 'planos' ? est.planeDims : est.obbDims
      errs.push(dims.map((d, i) => ((d - truth[i]) / truth[i]) * 100))
      vol.push(((dims[0] * dims[1] * dims[2]) / (truth[0] * truth[1] * truth[2]) - 1) * 100)
      pts = sc.cloud.positions.length / 3; method = est.method
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const errPct = [0, 1, 2].map((i) => mean(errs.map((e) => Math.abs(e[i]))))
    return { name: c.name, seeds: seeds.length, points: pts, method, errPct: errPct.map((x) => Math.round(x * 1000) / 1000), meanAbsPct: Math.round(mean(errPct) * 1000) / 1000, maxAbsPct: Math.round(Math.max(...errs.flat().map(Math.abs)) * 1000) / 1000, volumeErrPct: Math.round(mean(vol.map(Math.abs)) * 1000) / 1000 }
  })
}

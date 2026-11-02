// Gera docs/SMART_HOLD_SCAN/04-resultados-simulacao.md com o código real do algoritmo (vite-node scripts/sim-precision.ts).
import { writeFileSync } from 'node:fs'
import { runSimulationSuite } from '../src/modules/holdscan/simulate'

const box = { length: 12, height: 6, width: 8 }, seeds = [11, 22, 33]
const rows = runSimulationSuite(box, undefined, seeds)
const md = `# Resultados da simulação do algoritmo (SMART HOLD SCAN)

> **SIMULAÇÃO.** Espaço sintético de ${box.length} × ${box.width} × ${box.height} m (medidas exactas conhecidas), 108 vistas de profundidade (72×54 px) em 3 estações,
> ${seeds.length} sementes aleatórias por cenário. Os ruídos são **hipóteses**, não medições de nenhum telemóvel.
> Estes números mostram como o **método** (fusão de profundidade + planos RANSAC) reage a ruído, falhas, erro de escala e deriva.
> **Não** provam a precisão de qualquer dispositivo, e **não** devem ser citados como precisão do produto.

Erro % = |estimado − verdadeiro| ÷ verdadeiro × 100, dimensões ordenadas da maior (12 m) para a menor (6 m), média nas sementes.

| Cenário (SIMULADO) | Método | Pontos | Erro 12 m / 8 m / 6 m (%) | Média (%) | Máx. (%) | Erro do volume da caixa (%) |
|---|---|---:|---|---:|---:|---:|
${rows.map((r) => `| ${r.name} | ${r.method} | ${r.points} | ${r.errPct.join(' / ')} | ${r.meanAbsPct} | ${r.maxAbsPct} | ${r.volumeErrPct} |`).join('\n')}

## Leitura
- **Sem ruído** o algoritmo recupera as dimensões quase exactamente: valida a matemática (retroprojecção, fusão, planos).
- **Ruído moderado** (≈ 16 cm a 15 m) já produz erros da ordem do percentual e instabilidade entre sementes: a estimativa por planos depende da qualidade da profundidade a longa distância.
- **Erro de escala sistemático** (+2 %) propaga-se por inteiro e é **indetectável** pelo algoritmo: só medidas físicas de referência o revelam. Por isso a validação com trena/medidor laser é obrigatória.
- **Deriva da pose** (SLAM) degrada o resultado com o número de vistas: porões grandes exigem muitas estações e agravam o erro.
- Falhas aleatórias de leitura (dropout) têm pouco efeito se restarem pontos suficientes por parede. **Atenção:** o cenário «ruído moderado + 20 % de falhas» sai melhor do que o «ruído moderado» sem falhas; isso reflecte a variabilidade do método com ruído forte (sequências aleatórias diferentes), não um benefício das falhas.
- Limitações do próprio teste: espaço vazio e paralelepipédico, sem tremonhas, nervuras, objectos, poeira ou reflexos.

Reproduzir: \`npx vite-node scripts/sim-precision.ts\`
`
writeFileSync(new URL('../docs/SMART_HOLD_SCAN/04-resultados-simulacao.md', import.meta.url), md)
console.log(md.split('\n').filter((l) => l.startsWith('|')).join('\n'))

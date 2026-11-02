# Resultados da simulação do algoritmo (SMART HOLD SCAN)

> **SIMULAÇÃO.** Espaço sintético de 12 × 8 × 6 m (medidas exactas conhecidas), 108 vistas de profundidade (72×54 px) em 3 estações,
> 3 sementes aleatórias por cenário. Os ruídos são **hipóteses**, não medições de nenhum telemóvel.
> Estes números mostram como o **método** (fusão de profundidade + planos RANSAC) reage a ruído, falhas, erro de escala e deriva.
> **Não** provam a precisão de qualquer dispositivo, e **não** devem ser citados como precisão do produto.

Erro % = |estimado − verdadeiro| ÷ verdadeiro × 100, dimensões ordenadas da maior (12 m) para a menor (6 m), média nas sementes.

| Cenário (SIMULADO) | Método | Pontos | Erro 12 m / 8 m / 6 m (%) | Média (%) | Máx. (%) | Erro do volume da caixa (%) |
|---|---|---:|---|---:|---:|---:|
| Ideal (sem ruído) | planos | 150608 | 0.001 / 0.002 / 0 | 0.001 | 0.002 | 0.003 |
| Ruído baixo (3 mm + 0,2 %) | planos | 176808 | 0.002 / 0.026 / 0.002 | 0.01 | 0.028 | 0.029 |
| Ruído moderado (1 cm + 1 %) | planos | 237874 | 0.9 / 1.555 / 1.453 | 1.303 | 4.414 | 4.048 |
| Ruído moderado + 20 % de falhas | planos | 208151 | 0.181 / 0.251 / 0.034 | 0.155 | 0.613 | 0.358 |
| Erro de escala sistemático +2 % | planos | 159103 | 1.912 / 1.927 / 1.942 | 1.927 | 1.942 | 5.893 |
| Deriva de posição 1 cm/frame | planos | 193317 | 0.448 / 0.135 / 0.189 | 0.257 | 0.791 | 0.388 |
| Deriva de posição 3 cm/frame | caixa_envolvente | 273609 | 3.21 / 6.818 / 9.018 | 6.349 | 9.434 | 20.19 |
| Combinado (1 cm + 1 %, deriva 2 cm/frame, 10 % falhas) | caixa_envolvente | 254654 | 3.734 / 6.815 / 7.043 | 5.864 | 9.012 | 18.617 |

## Leitura
- **Sem ruído** o algoritmo recupera as dimensões quase exactamente: valida a matemática (retroprojecção, fusão, planos).
- **Ruído moderado** (≈ 16 cm a 15 m) já produz erros da ordem do percentual e instabilidade entre sementes: a estimativa por planos depende da qualidade da profundidade a longa distância.
- **Erro de escala sistemático** (+2 %) propaga-se por inteiro e é **indetectável** pelo algoritmo: só medidas físicas de referência o revelam. Por isso a validação com trena/medidor laser é obrigatória.
- **Deriva da pose** (SLAM) degrada o resultado com o número de vistas: porões grandes exigem muitas estações e agravam o erro.
- Falhas aleatórias de leitura (dropout) têm pouco efeito se restarem pontos suficientes por parede. **Atenção:** o cenário «ruído moderado + 20 % de falhas» sai melhor do que o «ruído moderado» sem falhas; isso reflecte a variabilidade do método com ruído forte (sequências aleatórias diferentes), não um benefício das falhas.
- Limitações do próprio teste: espaço vazio e paralelepipédico, sem tremonhas, nervuras, objectos, poeira ou reflexos.

Reproduzir: `npx vite-node scripts/sim-precision.ts`

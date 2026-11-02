# 3. Protocolo de validação de precisão

Objectivo: comparar dimensões digitalizadas com medidas físicas conhecidas e **registar os erros**. **Nenhuma medição é apresentada como precisa sem este processo.**

## 3.1 Material
- Instrumento de referência: trena de aço ou medidor laser, com incerteza conhecida (anote-a).
- Um espaço de teste físico com ≥ 6 dimensões mensuráveis (comprimento, largura, altura, diagonais, vão de portas).
- O dispositivo/aplicação a avaliar (anote modelo, sistema operativo e método).

## 3.2 Procedimento
1. Meça **cada dimensão 2 vezes** com o instrumento de referência e registe o valor médio e a incerteza.
2. Digitalize o espaço (captura AR ou importação). Faça **pelo menos 3 digitalizações distintas** (novo percurso cada vez).
3. No separador *Modelo 3D*, use *Medir entre 2 pontos* para cada dimensão e *Usar na validação*.
4. No separador *Validação*, registe: dispositivo, método, dimensão, valor físico, instrumento, incerteza, valor digitalizado, condições (luz, poeira, distância, duração).
5. Repita em condições diferentes (luz fraca, outra posição de partida, percurso mais longo).
6. Os registos são **imutáveis**; se errar, registe uma nova medição e explique nas condições.

## 3.3 Critérios (provisórios)
Valores iniciais configuráveis em `platform_settings.scan_validation_criteria`:
- ≥ 10 medições e ≥ 3 digitalizações distintas;
- erro médio absoluto ≤ 1 % e erro máximo ≤ 2 %.

Estes números **não são norma**: têm de ser definidos pela direcção técnica de acordo com o contrato e o método oficial de quantificação. O sistema mostra apenas: *Sem validação*, *Validação incompleta*, *Não cumpre os critérios* ou *Cumpre critérios provisórios* — nunca «preciso».

## 3.4 O que reportar
Número de medições e digitalizações; viés (erro médio com sinal), erro médio absoluto, RMSE, erro máximo; condições; limitações observadas (alcance, deriva, superfícies, escuridão, poeira). Um erro de escala sistemático aparece como viés constante.

## 3.5 Pré-requisitos para a fase seguinte (volume de carga)
- Validação cumprida para o dispositivo e o método, **em porão real** (não só numa sala).
- Procedimento definido para a superfície do granel (ângulo de repouso, nivelamento) e para a densidade.
- Comparação paralela com o método oficial (por exemplo, draft survey) em vários navios antes de qualquer uso comercial.

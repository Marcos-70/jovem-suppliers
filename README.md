# JOVEM+ SUPPLIERS

Plataforma B2B que liga fornecedores angolanos a grandes empresas (sector petrolífero e industrial): perfil empresarial, documentos com validade,
qualificação, pedidos de cotação, propostas rastreáveis, decisão fundamentada, relatórios e auditoria. Inclui os módulos **JOVEM+ BUSINESS**:
**Mapas de inspecção** (controlo de mercadorias no telemóvel) e **SMART HOLD SCAN** (protótipo de digitalização 3D de porões).

- **Frontend:** React 18 + TypeScript + Vite + Tailwind (Poppins / Inter). Identidade: azul-marinho, amarelo/dourado, cenário de plataforma petrolífera.
- **Backend:** Supabase (PostgreSQL + Auth + Storage + RLS). Regras de negócio em funções SQL.
- **Idioma:** português de Angola. Datas `DD/MM/AAAA`, fuso `Africa/Luanda`, moeda sempre explícita (AOA/USD/EUR).

## Arranque rápido (sem backend)

```bash
npm install
npm run dev          # http://localhost:5173
```

Sem variáveis do Supabase a aplicação arranca com dados em memória (perdem-se ao recarregar a página; não há isolamento real entre contas).
Em *Entrar* há **contas de teste** — 3 empresas × 3 utilizadores com funções diferentes, mais a superadministradora:

| Empresa | Utilizador | Função |
|---|---|---|
| Atlântico Inspecções e Controlo, Lda | Paulo Ferreira / Ana Baptista / Joana Pires | Administrador / **Inspectora** / Auditora |
| Porto Grãos, SA | Rui Cardoso / Carlos Neto / Marta Gomes | Administrador / Comprador / Compras e qualificação |
| Kwanza Logística Portuária, Lda | Elias Tavares / Luzia Costa / Hélder Quintas | Administrador / **Inspectora** / Responsável documental |
| Plataforma | Teresa Mendes | Superadministradora (aprova perfis e documentos) |

Não há pedidos, propostas, documentos nem mapas de exemplo: tudo é criado pelos utilizadores.

## Ligar a um backend real (Supabase)

1. Crie um projecto em supabase.com (ou `supabase start`).
2. Aplique as migrações por ordem: `supabase link --project-ref <ref>` e `supabase db push` (001 esquema · 002 segurança · 003 funções · 004 dados de referência · 005 papel inspector · 006 mapas de inspecção · 007 digitalizações).
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave **anon**, nunca a `service_role`).
4. No painel Auth: *Site URL* e *Redirect URLs* (`/entrar`, `/redefinir-palavra-passe`), confirmação de e-mail activa, palavra-passe mínima de 10 caracteres (ver `supabase/config.toml`).
5. **Dados iniciais** (as 3 empresas e os utilizadores) — **script não testado**, requer o projecto: `SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… SEED_PASSWORD='…' node scripts/seed-iniciais.mjs`. Ou registe-se normalmente e promova o primeiro superadministrador no SQL Editor: `select public.bootstrap_superadmin('o-seu-email@dominio.ao');`.
6. **Alertas diários** (validade de documentos e prazos): `select cron.schedule('jovem-alertas','0 6 * * *','select public.generate_alerts()');` ou a Edge Function `supabase/functions/expiry-alerts` (não testada).

Guia completo (Supabase + alojamento + administrador): `docs/PUBLICAR.md`.

## Publicação do frontend

```bash
npm run build        # gera dist/
```

Publique `dist/` em qualquer alojamento estático com *fallback* para `index.html` (`vercel.json` e `public/_redirects` incluídos). Defina as variáveis `VITE_*`. Câmara e AR exigem **HTTPS**.
Existe também um build de **ficheiro único** (`npx vite build -c vite.single.config.ts`) com navegação em memória, usado para páginas alojadas dentro de outras páginas.

## Testes

```bash
npm run typecheck    # TypeScript estrito
npm test             # 90 testes: domínio, relatórios, permissões, mapas de inspecção, núcleo 3D e interface completa
npm run test:sql     # 150 verificações em PostgreSQL real: migrações, RLS, funções, paridade de cálculo
```

`test:sql` precisa de um PostgreSQL local; usa `supabase/tests/shim.sql` (emulador mínimo de `auth`/`storage`, **nunca** para o Supabase).

Cobertura principal: isolamento entre organizações; ninguém se auto-promove nem atribui funções a si próprio; propostas seladas, prazos e versões imutáveis; cálculos
com paridade SQL/TypeScript (propostas e mapas de inspecção); **segregação de funções** (quem preenche um mapa não o aprova); validações de precisão imutáveis;
fluxo de interface ponta-a-ponta (preencher e submeter mapa, aprovar, relatório, simular digitalização, registar validação).

## Mapas de inspecção (controlo de mercadorias)

O inspector cria o mapa (navio, porto, mercadoria, tolerância) e preenche linhas no telemóvel: mercadoria, porão, lote, unidade, **declarada / contada / avariada**, peso unitário.
O servidor calcula diferença, diferença %, quantidade boa e peso líquido; o ecrã mostra os mesmos cálculos em tempo real. Totais **por unidade** (nunca se somam unidades diferentes).
Fluxo: rascunho → submetido → aprovado ou devolvido (com motivo). Mapas aprovados são imutáveis. Relatório digital imprimível / PDF e CSV.
A tolerância (valor inicial 0,5 %) é configurável por mapa e **não é uma norma**.

## JOVEM+ SMART HOLD SCAN (fase 1 — protótipo)

Separadores: **Sensores** (detecta o que o dispositivo oferece; câmara; teste AR) · **Digitalizar** (captura AR WebXR, importação PLY/OBJ/GLB, espaço de teste simulado) ·
**Modelo 3D** (visualizar, medir entre dois pontos, estimar dimensões, exportar PLY/OBJ/JSON, guardar) · **Validação de precisão** · **Limitações**.

Estado real, sem rodeios:
- **Testado:** geometria, fusão de profundidade, estimativa de planos, E/S de ficheiros, estatística de validação e detecção de capacidades (testes automáticos), com dados **sintéticos**.
- **Não testado em telemóvel real:** captura AR directa (WebXR) e o visualizador em WebGL (só compilação). O iPhone não suporta WebXR: use uma app de LiDAR e **importe** o modelo.
- **Nenhuma medição é apresentada como precisa.** O módulo mostra sempre «indicativo — não validado»; o veredicto só existe com registos de validação (critérios **provisórios**).
- **Não há cálculo de volume de carga** (trigo, arroz…): fica para a fase seguinte, depois de validação em porão real.

Documentação em `docs/SMART_HOLD_SCAN/`: auditoria técnica e integração · pesquisa tecnológica (ARCore, ARKit/LiDAR, WebXR, fotogrametria, dispositivos) · protocolo de validação · resultados da simulação do algoritmo.

## Decisões e limitações

- **NIF:** 10 dígitos ou 9 dígitos + 2 letras + 3 dígitos (`NIF_REGEX`, igual no servidor). Confirme o formato oficial.
- **Planos:** a página mostra a estrutura sugerida (Starter, Professional, Business, Enterprise). Não existe cobrança nem limitação de funcionalidades.
- **Contratos:** não são geridos nesta versão; «adjudicado» não equivale a contrato.
- **E-mail:** só notificações dentro da plataforma (o envio por e-mail precisa de um serviço configurado).
- **Relatórios** são calculados no cliente a partir de dados filtrados por RLS; para grandes volumes, mover para vistas SQL.
- **Hora dos prazos:** o campo usa o fuso do dispositivo (Angola: WAT); guarda-se em UTC.
- **Textos legais** (termos, privacidade) são minutas e exigem revisão jurídica.
- Não foi possível verificar o aspecto num navegador real neste ambiente: validado por compilação, testes em jsdom e inspecção do CSS. Faça uma passagem visual (telemóvel e computador) antes de uso alargado.
- Exportação só em CSV/PLY/OBJ/JSON (sem PDF nativo; o relatório de inspecção usa a impressão do navegador).

## Estrutura

```
supabase/migrations/   001–004 plataforma · 005 papel inspector · 006 mapas de inspecção · 007 digitalizações e validações
supabase/tests/        shim.sql, run.sh, sql/*.sql, vectores de cálculo
src/lib/domain/        regras puras (propostas, prazos, documentos, relatórios, permissões, inspecções)
src/modules/holdscan/  geometria, fusão de profundidade, estimativa do espaço, E/S, visualizador 3D, captura WebXR, validação
src/services/          acesso a dados (Supabase)
src/pages/             public/ · app/ · admin/
docs/                  INDICADORES.md · SEGURANCA.md · SMART_HOLD_SCAN/
scripts/               seed-iniciais.mjs (não testado) · geradores de testes SQL · simulação de precisão
```

# Publicar para todos (produção)

Tempo estimado: 30–45 minutos. Não precisa de programar: só de copiar e colar.


## Atalho: GitHub + Vercel (passo a passo)
1. **GitHub:** em github.com → *New repository* (privado, vazio, sem README). No computador, dentro da pasta do projecto descomprimida:
   ```bash
   git init
   git add .
   git commit -m "JOVEM+ SUPPLIERS"
   git branch -M main
   git remote add origin https://github.com/O-SEU-UTILIZADOR/jovem-suppliers.git
   git push -u origin main
   ```
   (o GitHub pede o seu início de sessão ou um token **na sua máquina** — nunca o partilhe com ninguém). O ficheiro `.github/workflows/ci.yml` corre tipos, testes e build a cada alteração.
2. **Vercel:** vercel.com → *Add New → Project* → *Import* o repositório. Framework: Vite (detectado). Em *Environment Variables* adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Passo 1 deste guia) para **Production** e **Preview**. *Deploy*.
3. A cada `git push` na `main`, o Vercel publica automaticamente. Se mudar as variáveis, faça *Redeploy* (são embutidas no build).
4. **Segurança incorporada:** se publicar sem estas variáveis, o sítio mostra «Configuração em falta» em vez de abrir com dados de teste.

## Passo 1 — Criar a base de dados (Supabase)
1. Crie uma conta em https://supabase.com e um projecto novo (escolha a região mais próxima; guarde a palavra-passe da base de dados).
2. Abra **SQL Editor** e execute **um ficheiro de cada vez, por esta ordem**, colando o conteúdo de `supabase/migrations/`:
   `…001_schema.sql` → `…002_security.sql` → `…003_functions.sql` → `…004_reference_data.sql` → `…005_inspector_role.sql` → `…006_inspections.sql` → `…007_hold_scans.sql`.
   (O ficheiro 005 tem de correr sozinho, antes do 006.) Cada um deve terminar com «Success».
3. Em **Project Settings → API** copie **Project URL** e a chave **anon public**. **Nunca** use nem partilhe a chave `service_role` no sítio web.

## Passo 2 — Publicar o sítio web
Escolha uma opção:

**A) Vercel (recomendado)** — vercel.com → *Add New → Project* → importe o repositório (GitHub) com este código.
Em *Environment Variables* defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. *Build command:* `npm run build` · *Output:* `dist`. Deploy.

**B) Netlify / Cloudflare Pages** — o mesmo (repositório + as duas variáveis; build `npm run build`, pasta `dist`). `netlify.toml` e `public/_redirects` já tratam das rotas.

**C) Sem repositório** — no seu computador: copie `.env.example` para `.env.local`, preencha as duas variáveis, execute `npm install` e `npm run build`, e arraste a pasta `dist` para https://app.netlify.com/drop. As variáveis ficam embutidas na altura do build: se mudar a chave, refaça o build.

O endereço final (por exemplo `https://jovem-suppliers.vercel.app`) é o que envia aos colegas. Pode ligar um domínio próprio nas definições do alojamento.

## Passo 3 — Autenticação (Supabase → Authentication)
- **URL Configuration:** *Site URL* = o endereço final; em *Redirect URLs* acrescente `https://O-SEU-ENDERECO/entrar` e `https://O-SEU-ENDERECO/redefinir-palavra-passe`.
- Mantenha a **confirmação de e-mail** activa e a palavra-passe mínima de 10 caracteres.
- **E-mail:** o serviço de e-mail incluído no Supabase tem um limite baixo de mensagens por hora. Para muitos utilizadores configure um SMTP próprio (Authentication → SMTP).

## Passo 4 — Primeira conta de administração
1. No sítio publicado, clique em **Registar empresa** e crie a primeira conta (confirme o e-mail).
2. No SQL Editor execute (com o seu e-mail): `select public.bootstrap_superadmin('o-seu-email@dominio.ao');`
3. Saia e entre de novo: passa a ver a **Administração** (aprovar perfis e documentos, configurações).

## Passo 5 — Utilizadores e empresas
- Cada colega regista-se em **Registar empresa** (a empresa é criada com ele como administrador) e depois atribui funções em **Equipa e funções** (inspector, comprador, etc.). A pessoa tem de já ter conta.
- Opcional — criar as 3 empresas e 9 utilizadores iniciais de uma vez (script **não testado**, corre uma só vez no seu computador): `SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… SEED_PASSWORD='uma-palavra-passe-forte' node scripts/seed-iniciais.mjs`. Troque as palavras-passe depois.

## Passo 6 — Alertas automáticos
Para os alertas de validade de documentos e prazos, no SQL Editor: `select cron.schedule('jovem-alertas','0 6 * * *','select public.generate_alerts()');` (precisa da extensão pg_cron activada em Database → Extensions).

## Lista de verificação antes de convidar os colegas
- [ ] Registar-se, entrar e sair funcionam; e-mail de confirmação chega.
- [ ] Criar empresa → preencher perfil → submeter → a administração aprova.
- [ ] Carregar um documento e a administração conseguir abri-lo.
- [ ] Inspector: criar mapa, preencher, submeter; outra pessoa aprovar; ver o relatório.
- [ ] Abrir no telemóvel (HTTPS) e confirmar que a câmara pede permissão.
- [ ] Fazer uma cópia de segurança (Supabase → Database → Backups; depende do plano).

## O que NÃO está activo
E-mails de notificação (só dentro da plataforma), cobrança de planos, gestão de contratos, antivírus de ficheiros. Os textos legais são minutas: peça revisão jurídica.

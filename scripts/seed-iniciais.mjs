// Cria num Supabase REAL as 3 empresas iniciais e os 9 utilizadores (+ 1 superadministrador), com funções diferentes.
// NÃO TESTADO neste ambiente (requer um projecto Supabase). Executar uma única vez, localmente:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... SEED_PASSWORD='uma-palavra-passe-forte' node scripts/seed-iniciais.mjs
// A service_role key é usada só aqui (nunca vai para o frontend). Altere as palavras-passe depois do primeiro acesso.
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, SEED_PASSWORD: password } = process.env
if (!url || !anon || !service || !password || password.length < 10) { console.error('Defina SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY e SEED_PASSWORD (≥ 10 caracteres).'); process.exit(1) }
const admin = createClient(url, service, { auth: { persistSession: false } })
const D = '@jovemplus.test' // troque pelo domínio real dos utilizadores

const companies = [
  { legal: 'Atlântico Inspecções e Controlo, Lda', trade: 'Atlântico Inspecções', nif: '5417000001', type: 'both', sector: 'Inspecção industrial', phone: '+244 923 000 001', email: 'geral@atlantico-inspeccoes.test',
    users: [['paulo.ferreira', 'Paulo Ferreira', 'org_admin'], ['ana.baptista', 'Ana Baptista', 'inspector'], ['joana.pires', 'Joana Pires', 'auditor']] },
  { legal: 'Porto Grãos, SA', trade: 'Porto Grãos', nif: '5417000002', type: 'buyer', sector: 'Importação de cereais', phone: '+244 923 000 002', email: 'compras@portograos.test',
    users: [['rui.cardoso', 'Rui Cardoso', 'org_admin'], ['carlos.neto', 'Carlos Neto', 'buyer'], ['marta.gomes', 'Marta Gomes', 'procurement_qualifier']] },
  { legal: 'Kwanza Logística Portuária, Lda', trade: 'Kwanza Portuária', nif: '5417000003', type: 'supplier', sector: 'Transporte e logística', phone: '+244 923 000 003', email: 'ops@kwanza-portuaria.test',
    users: [['elias.tavares', 'Elias Tavares', 'org_admin'], ['luzia.costa', 'Luzia Costa', 'inspector'], ['helder.quintas', 'Hélder Quintas', 'doc_operator']] },
]

async function createUser(local, name) {
  const { data, error } = await admin.auth.admin.createUser({ email: local + D, password, email_confirm: true, user_metadata: { full_name: name } })
  if (error && !/already/i.test(error.message)) throw error
  const id = data?.user?.id ?? (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === local + D).id
  return id
}
async function as(local) { const c = createClient(url, anon, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: local + D, password }); if (error) throw error; return c }

const sa = await createUser('admin', 'Teresa Mendes'); await admin.rpc('bootstrap_superadmin', { p_email: 'admin' + D })
const { data: cat } = await admin.from('categories').select('id,slug')
for (const c of companies) {
  for (const [l, n] of c.users) await createUser(l, n)
  const owner = await as(c.users[0][0])
  const { data: orgId, error } = await owner.rpc('create_organization', { p_legal_name: c.legal, p_trade_name: c.trade, p_nif: c.nif, p_org_type: c.type, p_sector: c.sector, p_province: 'Luanda', p_municipality: 'Luanda', p_email: c.email, p_phone: c.phone })
  if (error) { console.error(c.legal, error.message); continue }
  for (const [l, , role] of c.users.slice(1)) { const { error: e } = await owner.rpc('add_member', { p_org: orgId, p_email: l + D, p_role: role }); if (e) console.error(l, e.message) }
  await owner.from('organizations').update({ address: 'Luanda', contact_person: c.users[0][1], description: `Empresa ${c.trade}.`, visibility: 'platform' }).eq('id', orgId)
  await owner.from('services').insert({ organization_id: orgId, category_id: cat.find((x) => x.slug === 'transporte-e-logistica').id, name: 'Serviço principal', specialties: [], areas: ['Luanda'] })
  const adminSession = await as('admin')
  const { error: r } = await adminSession.rpc('review_profile', { p_org: orgId, p_result: 'approved', p_reason: null }); if (r) console.error('aprovar', c.legal, r.message)
  console.log('OK', c.legal)
}
console.log('Concluído. Superadministradora:', 'admin' + D, '(id', sa + ')')

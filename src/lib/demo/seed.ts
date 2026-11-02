// Dados iniciais do modo de demonstração: apenas configuração de referência, 3 empresas e os seus utilizadores.
// Não há pedidos, propostas, documentos nem mapas de exemplo: tudo o resto é criado pelos utilizadores.
export type Row = Record<string, any>
export interface DemoUser { id: string; email: string; full_name: string; is_superadmin: boolean; is_active: boolean; group: string; role: string }
export interface DemoStore {
  tables: Record<string, Row[]>
  users: DemoUser[]
  currentUserId: string | null
  seq: { opp: number; prop: number; insp: number }
}

const now = Date.now()
const iso = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString()
export const uid = (k: string, n: number) => `00000000-${k.padEnd(4, '0').slice(0, 4)}-4000-8000-${String(n).padStart(12, '0')}`

export function createSeed(): DemoStore {
  const G = { adm: 'Plataforma JOVEM+', c1: 'Atlântico Inspecções e Controlo, Lda', c2: 'Porto Grãos, SA', c3: 'Kwanza Logística Portuária, Lda' }
  const mk = (n: number, email: string, name: string, group: string, role: string, sup = false): DemoUser => ({ id: uid('usr', n), email: `${email}@jovemplus.test`, full_name: name, is_superadmin: sup, is_active: true, group, role })
  const users: DemoUser[] = [
    mk(1, 'admin', 'Teresa Mendes', G.adm, 'Superadministradora', true),
    mk(2, 'paulo.ferreira', 'Paulo Ferreira', G.c1, 'Administrador da empresa'),
    mk(3, 'ana.baptista', 'Ana Baptista', G.c1, 'Inspectora'),
    mk(4, 'joana.pires', 'Joana Pires', G.c1, 'Auditora'),
    mk(5, 'rui.cardoso', 'Rui Cardoso', G.c2, 'Administrador da empresa'),
    mk(6, 'carlos.neto', 'Carlos Neto', G.c2, 'Comprador'),
    mk(7, 'marta.gomes', 'Marta Gomes', G.c2, 'Compras e qualificação'),
    mk(8, 'elias.tavares', 'Elias Tavares', G.c3, 'Administrador da empresa'),
    mk(9, 'luzia.costa', 'Luzia Costa', G.c3, 'Inspectora'),
    mk(10, 'helder.quintas', 'Hélder Quintas', G.c3, 'Responsável documental'),
  ]
  const U = (n: number) => uid('usr', n)

  const cats = ['Petróleo e gás', 'Construção civil', 'Engenharia', 'Manutenção industrial', 'Electricidade', 'Instrumentação e automação', 'Metalomecânica', 'Transporte e logística', 'Equipamentos e peças', 'Segurança e saúde no trabalho', 'Inspecção industrial', 'Consultoria técnica', 'Formação profissional', 'Tecnologias de informação', 'Limpeza industrial', 'Serviços ambientais', 'Outros serviços empresariais']
  const categories = cats.map((name, i) => ({ id: uid('cat', i + 1), parent_id: null, name, slug: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-'), description: null, sort_order: i + 1, is_active: true }))
  const cat = (n: string) => categories.find((c) => c.name === n)!.id
  const dtDefs: [string, string, boolean][] = [['commercial_registry', 'Registo comercial', false], ['tax_proof', 'NIF / comprovativo fiscal', false], ['license', 'Licença', true], ['technical_certificate', 'Certificado técnico', false], ['training_certificate', 'Certificado de formação', false], ['quality_safety_cert', 'Certificação de qualidade e segurança', true], ['insurance', 'Seguro', true], ['worker_docs', 'Documentação de trabalhadores', false], ['equipment_docs', 'Documentação de equipamentos', false], ['inspection_report', 'Relatório de inspecção', false], ['contract_other', 'Contratos e outros documentos empresariais', false]]
  const document_types = dtDefs.map(([code, name, exp], i) => ({ id: uid('dtp', i + 1), code, name, description: null, requires_expiry: exp, alert_days: [30, 15, 7], max_size_mb: 10, allowed_mime: ['application/pdf', 'image/jpeg', 'image/png'], is_active: true, sort_order: i + 1 }))
  const dt = (code: string) => document_types.find((d) => d.code === code)!.id
  const qualification_requirements = [
    { id: uid('req', 1), name: 'Registo comercial válido', description: 'Documento aprovado e em vigor.', document_type_id: dt('commercial_registry'), category_id: null, min_validity_days: 0, is_mandatory: true, is_active: true },
    { id: uid('req', 2), name: 'NIF / comprovativo fiscal válido', description: 'Documento aprovado e em vigor.', document_type_id: dt('tax_proof'), category_id: null, min_validity_days: 0, is_mandatory: true, is_active: true },
  ]

  const org = (n: number, o: Row): Row => ({
    id: uid('org', n), trade_name: null, commercial_registry: null, website: null, founded_year: null, employee_count: null, capabilities: null, certifications_declared: [],
    profile_status: 'approved', profile_review_reason: null, verification_status: 'not_verified', verification_scope: null, verified_at: null, visibility: 'platform',
    visibility_consent_at: iso(-30), public_fields: [], is_active: true, submitted_at: iso(-30), profile_updated_at: iso(-10), created_at: iso(-40), ...o,
  })
  const organizations = [
    org(1, { legal_name: 'Atlântico Inspecções e Controlo, Lda', trade_name: 'Atlântico Inspecções', nif: '5417000001', org_type: 'both', sector: 'Inspecção industrial', province: 'Luanda', municipality: 'Luanda', address: 'Porto de Luanda, Edifício Administrativo', phone: '+244 923 000 001', email: 'geral@atlantico-inspeccoes.test', contact_person: 'Paulo Ferreira', description: 'Inspecção e controlo de mercadorias e cargas a granel em portos e terminais.' }),
    org(2, { legal_name: 'Porto Grãos, SA', trade_name: 'Porto Grãos', nif: '5417000002', org_type: 'buyer', sector: 'Importação de cereais', province: 'Luanda', municipality: 'Luanda', address: 'Zona Portuária, Armazém 7', phone: '+244 923 000 002', email: 'compras@portograos.test', contact_person: 'Rui Cardoso', description: 'Importação e distribuição de cereais e produtos alimentares.' }),
    org(3, { legal_name: 'Kwanza Logística Portuária, Lda', trade_name: 'Kwanza Portuária', nif: '5417000003', org_type: 'supplier', sector: 'Transporte e logística', province: 'Luanda', municipality: 'Viana', address: 'Zona Industrial de Viana, Lote 12', phone: '+244 923 000 003', email: 'ops@kwanza-portuaria.test', contact_person: 'Elias Tavares', description: 'Operações portuárias, armazenagem e transporte de cargas.' }),
  ]
  const O = (n: number) => uid('org', n)

  const organization_members: Row[] = []
  const mem = (org: number, user: number, role: string) => organization_members.push({ id: uid('mem', organization_members.length + 1), organization_id: O(org), user_id: U(user), role, is_active: true, created_at: iso(-30) })
  mem(1, 2, 'org_admin'); mem(1, 3, 'inspector'); mem(1, 4, 'auditor')
  mem(2, 5, 'org_admin'); mem(2, 6, 'buyer'); mem(2, 7, 'procurement_qualifier')
  mem(3, 8, 'org_admin'); mem(3, 9, 'inspector'); mem(3, 10, 'doc_operator')

  const services = [
    { organization_id: O(1), category_id: cat('Inspecção industrial'), name: 'Inspecção e controlo de cargas a granel', description: null, specialties: ['mapas de controlo', 'porões'], areas: ['Luanda'] },
    { organization_id: O(3), category_id: cat('Transporte e logística'), name: 'Operações portuárias e armazenagem', description: null, specialties: ['armazenagem'], areas: ['Luanda'] },
  ].map((s, i) => ({ ...s, id: uid('svc', i + 1) }))

  const profiles = users.map((u) => ({ id: u.id, full_name: u.full_name, phone: null, job_title: null, is_superadmin: u.is_superadmin, is_active: u.is_active, created_at: iso(-60) }))
  const platform_settings = [
    { key: 'profile_required_fields', value: ['legal_name', 'nif', 'sector', 'province', 'municipality', 'address', 'phone', 'email', 'contact_person', 'description', 'services'] },
    { key: 'document_alert_days', value: [30, 15, 7] }, { key: 'supported_currencies', value: ['AOA', 'USD', 'EUR'] },
  ]
  const empty = ['documents', 'document_versions', 'document_reviews', 'opportunities', 'opportunity_items', 'evaluation_criteria', 'deadline_extensions', 'supplier_invitations', 'clarifications', 'opportunity_notices', 'proposals', 'proposal_items', 'proposal_versions', 'evaluations', 'commercial_decisions', 'attachments', 'notifications', 'notification_preferences', 'audit_logs', 'inspection_maps', 'inspection_map_lines', 'hold_scans', 'scan_validations']
  return {
    users, currentUserId: null, seq: { opp: 0, prop: 0, insp: 0 },
    tables: { profiles, organizations, organization_members, categories, services, document_types, qualification_requirements, platform_settings, ...Object.fromEntries(empty.map((t) => [t, [] as Row[]])) },
  }
}

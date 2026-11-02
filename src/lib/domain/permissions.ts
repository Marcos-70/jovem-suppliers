import type { Membership, UserContext } from './types'

export const P = {
  orgView: 'org.view', orgEdit: 'org.edit', membersManage: 'org.members.manage',
  supplierSearch: 'supplier.search', servicesManage: 'services.manage',
  docView: 'document.view', docUpload: 'document.upload', docReview: 'document.review',
  oppView: 'opportunity.view', oppCreate: 'opportunity.create', oppManage: 'opportunity.manage', oppDecide: 'opportunity.decide',
  propView: 'proposal.view', propSubmit: 'proposal.submit', propEvaluate: 'proposal.evaluate',
  reportView: 'report.view', reportExport: 'report.export', auditView: 'audit.view',
  adminAccess: 'admin.access', adminOrgs: 'admin.organizations', adminUsers: 'admin.users', adminConfig: 'admin.config',
  inspView: 'inspection.view', inspCreate: 'inspection.create', inspReview: 'inspection.review',
  scanView: 'scan.view', scanCapture: 'scan.capture', scanValidate: 'scan.validate',
} as const

/** Permissões efectivas: da organização activa mais as da plataforma (superadministrador). */
export function permissionSet(ctx: UserContext | null, membership: Membership | null): Set<string> {
  const s = new Set<string>()
  ctx?.platform_permissions.forEach((p) => s.add(p))
  membership?.permissions.forEach((p) => s.add(p))
  return s
}

export const can = (perms: Set<string>, p: string) => perms.has(p)
export const canAny = (perms: Set<string>, ps: string[]) => ps.some((p) => perms.has(p))

/** Matriz de funções → permissões. Espelha supabase/migrations/…004 (verificado por teste). */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  superadmin: ['supplier.search', 'document.view', 'document.review', 'report.view', 'report.export', 'audit.view', 'admin.access', 'admin.organizations', 'admin.users', 'admin.config'],
  org_admin: ['org.view', 'org.edit', 'org.members.manage', 'supplier.search', 'services.manage', 'document.view', 'document.upload', 'opportunity.view', 'opportunity.create', 'opportunity.manage', 'opportunity.decide', 'proposal.view', 'proposal.submit', 'proposal.evaluate', 'report.view', 'report.export', 'audit.view', 'inspection.view', 'inspection.create', 'inspection.review', 'scan.view', 'scan.capture', 'scan.validate'],
  supplier: ['org.view', 'services.manage', 'document.view', 'document.upload', 'opportunity.view', 'proposal.view', 'proposal.submit', 'report.view'],
  buyer: ['org.view', 'supplier.search', 'opportunity.view', 'opportunity.create', 'opportunity.manage', 'proposal.view', 'proposal.evaluate', 'report.view', 'inspection.view'],
  procurement_qualifier: ['org.view', 'supplier.search', 'document.view', 'opportunity.view', 'opportunity.decide', 'proposal.view', 'proposal.evaluate', 'report.view', 'report.export', 'inspection.view', 'inspection.review', 'scan.view'],
  doc_operator: ['org.view', 'document.view', 'document.upload', 'opportunity.view', 'report.view'],
  auditor: ['org.view', 'document.view', 'opportunity.view', 'proposal.view', 'report.view', 'report.export', 'audit.view', 'inspection.view', 'scan.view'],
  inspector: ['org.view', 'inspection.view', 'inspection.create', 'report.view', 'scan.view', 'scan.capture', 'scan.validate'],
}

export const PERMISSION_LABEL: Record<string, string> = {
  'org.view': 'Ver dados da organização', 'org.edit': 'Editar perfil empresarial', 'org.members.manage': 'Gerir membros e funções',
  'supplier.search': 'Pesquisar fornecedores', 'services.manage': 'Gerir serviços', 'document.view': 'Consultar documentos',
  'document.upload': 'Carregar documentos', 'document.review': 'Analisar documentos', 'opportunity.view': 'Ver pedidos',
  'opportunity.create': 'Criar pedidos', 'opportunity.manage': 'Gerir pedidos e convites', 'opportunity.decide': 'Registar decisões',
  'proposal.view': 'Ver propostas', 'proposal.submit': 'Submeter propostas', 'proposal.evaluate': 'Avaliar propostas',
  'report.view': 'Ver relatórios', 'report.export': 'Exportar relatórios', 'audit.view': 'Ver auditoria',
  'admin.access': 'Área administrativa', 'admin.organizations': 'Gerir organizações', 'admin.users': 'Gerir utilizadores', 'admin.config': 'Configurações globais',
  'inspection.view': 'Ver mapas de inspecção', 'inspection.create': 'Preencher mapas de inspecção', 'inspection.review': 'Aprovar ou devolver mapas',
  'scan.view': 'Ver digitalizações 3D', 'scan.capture': 'Registar digitalizações 3D', 'scan.validate': 'Registar validações de precisão',
}

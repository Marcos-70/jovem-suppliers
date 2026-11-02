import type {
  AppRole, InspectionStatus, DocStatus, OpportunityStatus, ProfileStatus, ProposalStatus, VerificationStatus, OrgType,
} from './types'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'
export interface Label { text: string; tone: Tone }

export const PROFILE_STATUS: Record<ProfileStatus, Label> = {
  draft: { text: 'Rascunho', tone: 'neutral' },
  incomplete: { text: 'Incompleto', tone: 'warn' },
  submitted: { text: 'Submetido', tone: 'info' },
  under_review: { text: 'Em análise', tone: 'info' },
  approved: { text: 'Aprovado', tone: 'ok' },
  corrections_pending: { text: 'Correcções pendentes', tone: 'warn' },
  suspended: { text: 'Suspenso', tone: 'danger' },
  rejected: { text: 'Rejeitado', tone: 'danger' },
}
export const VERIFICATION_STATUS: Record<VerificationStatus, Label> = {
  not_verified: { text: 'Sem verificação', tone: 'neutral' },
  in_progress: { text: 'Verificação em curso', tone: 'info' },
  verified: { text: 'Verificado (âmbito definido)', tone: 'ok' },
}
export type EffectiveDocStatus = DocStatus | 'expiring' | 'expired' | 'missing'
export const DOC_STATUS: Record<EffectiveDocStatus, Label> = {
  missing: { text: 'Por apresentar', tone: 'neutral' },
  submitted: { text: 'Submetido', tone: 'info' },
  under_review: { text: 'Em análise', tone: 'info' },
  approved: { text: 'Válido e aprovado', tone: 'ok' },
  correction_pending: { text: 'Pendente de correcção', tone: 'warn' },
  rejected: { text: 'Rejeitado', tone: 'danger' },
  expiring: { text: 'Próximo da validade', tone: 'warn' },
  expired: { text: 'Expirado', tone: 'danger' },
  superseded: { text: 'Substituído', tone: 'neutral' },
}
export const OPP_STATUS: Record<OpportunityStatus, Label> = {
  draft: { text: 'Rascunho', tone: 'neutral' },
  published: { text: 'Publicado', tone: 'info' },
  invites_sent: { text: 'Convites enviados', tone: 'info' },
  open: { text: 'Aberto para propostas', tone: 'ok' },
  under_evaluation: { text: 'Em avaliação', tone: 'info' },
  clarification: { text: 'Em esclarecimento', tone: 'warn' },
  closed: { text: 'Encerrado', tone: 'neutral' },
  awarded: { text: 'Adjudicado', tone: 'ok' },
  cancelled: { text: 'Cancelado', tone: 'danger' },
  archived: { text: 'Arquivado', tone: 'neutral' },
}
export const PROPOSAL_STATUS: Record<ProposalStatus, Label> = {
  draft: { text: 'Rascunho', tone: 'neutral' },
  submitted: { text: 'Submetida', tone: 'info' },
  in_evaluation: { text: 'Em avaliação', tone: 'info' },
  withdrawn: { text: 'Retirada', tone: 'neutral' },
  rejected: { text: 'Não seleccionada', tone: 'danger' },
  selected: { text: 'Seleccionada', tone: 'ok' },
}
export const ROLE_LABEL: Record<AppRole, string> = {
  superadmin: 'Superadministrador JOVEM+',
  org_admin: 'Administrador da empresa',
  supplier: 'Fornecedor',
  buyer: 'Comprador',
  procurement_qualifier: 'Responsável de compras e qualificação',
  doc_operator: 'Responsável documental e operacional',
  auditor: 'Auditor / consulta',
  inspector: 'Inspector',
}
export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  supplier: 'Fornecedor', buyer: 'Empresa compradora', both: 'Fornecedor e comprador',
}
export const VISIBILITY_LABEL = {
  private: 'Privado — só a minha organização',
  platform: 'Utilizadores autenticados da plataforma',
  public: 'Público — também visível sem iniciar sessão',
} as const
export const OPTIONAL_PUBLIC_FIELDS: { key: string; label: string }[] = [
  { key: 'nif', label: 'NIF' },
  { key: 'address', label: 'Morada comercial' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail profissional' },
  { key: 'website', label: 'Website' },
  { key: 'contact_person', label: 'Pessoa de contacto' },
  { key: 'employee_count', label: 'Número de trabalhadores' },
  { key: 'capabilities', label: 'Capacidades técnicas declaradas' },
  { key: 'certifications', label: 'Certificações declaradas' },
  { key: 'compliance', label: 'Conformidade documental (apenas tipos válidos, sem ficheiros)' },
]
export const PROVINCES = [
  'Bengo', 'Benguela', 'Bié', 'Cabinda', 'Cuando', 'Cubango', 'Cuanza Norte', 'Cuanza Sul',
  'Cunene', 'Huambo', 'Huíla', 'Icolo e Bengo', 'Luanda', 'Lunda Norte', 'Lunda Sul',
  'Malanje', 'Moxico', 'Moxico Leste', 'Namibe', 'Uíge', 'Zaire',
]
export const UNITS = ['un', 'h', 'dia', 'mês', 'm', 'm²', 'm³', 'kg', 't', 'l', 'serviço', 'lote']
export const CURRENCIES = ['AOA', 'USD', 'EUR']

export const INSPECTION_STATUS: Record<InspectionStatus, Label> = {
  draft: { text: 'Rascunho', tone: 'neutral' }, submitted: { text: 'Submetido para revisão', tone: 'info' },
  approved: { text: 'Aprovado', tone: 'ok' }, returned: { text: 'Devolvido para correcção', tone: 'warn' },
}
export const SCAN_METHOD_LABEL = {
  webxr_hit_test: 'Captura AR — pontos (WebXR)', webxr_depth: 'Captura AR — profundidade (WebXR)',
  imported_model: 'Modelo importado (LiDAR / fotogrametria)', simulated: 'SIMULADO (teste do algoritmo)', manual: 'Manual',
} as const
export const INSPECTION_UNITS = ['un', 'saco', 'cx', 'palete', 'kg', 't', 'm³', 'l', 'lote']

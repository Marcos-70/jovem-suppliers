// Tradução dos códigos de erro devolvidos pelas funções do servidor.
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Inicie sessão para continuar.',
  PERMISSION_DENIED: 'Não tem permissão para realizar esta acção.',
  NIF_ALREADY_REGISTERED: 'Já existe uma organização registada com este NIF.',
  INVALID_NIF: 'NIF inválido.',
  NIF_LOCKED_AFTER_VERIFICATION: 'O NIF não pode ser alterado depois da verificação.',
  RATE_LIMIT_EXCEEDED: 'Demasiados pedidos. Aguarde algum tempo e tente novamente.',
  INVALID_STATE_TRANSITION: 'Esta acção não é possível no estado actual.',
  REASON_REQUIRED: 'Indique o motivo (mínimo de 5 caracteres).',
  RATIONALE_REQUIRED: 'O fundamento da decisão é obrigatório (mínimo de 10 caracteres).',
  PROFILE_INCOMPLETE: 'O perfil ainda não tem todos os campos obrigatórios.',
  PROFILE_NOT_APPROVED: 'O perfil tem de estar aprovado.',
  NO_APPROVED_DOCUMENTS: 'A verificação exige pelo menos um documento aprovado e em vigor.',
  VERIFICATION_SCOPE_REQUIRED: 'Indique o âmbito da verificação.',
  INVALID_DOCUMENT_TYPE: 'Tipo documental inválido ou inactivo.',
  INVALID_FILE_TYPE: 'Tipo de ficheiro não permitido.',
  FILE_TOO_LARGE: 'O ficheiro excede o tamanho máximo permitido.',
  EXPIRY_REQUIRED: 'Este tipo de documento exige data de validade.',
  INVALID_DATES: 'A data de validade não pode ser anterior à data de emissão.',
  INVALID_STORAGE_PATH: 'Caminho de ficheiro inválido.',
  DOCUMENT_UNDER_REVIEW: 'O documento está em análise e não pode ser substituído agora.',
  ITEMS_REQUIRED: 'Adicione pelo menos um item ao pedido.',
  DEADLINE_IN_PAST: 'O prazo tem de ser uma data futura.',
  CRITERIA_WEIGHTS_INVALID: 'Os pesos dos critérios de avaliação têm de somar 100.',
  INVITEES_REQUIRED: 'Seleccione pelo menos um fornecedor para convidar.',
  SUPPLIER_NOT_ELIGIBLE: 'Só podem ser convidados fornecedores activos com perfil aprovado.',
  DEADLINE_NOT_REACHED: 'O prazo ainda não terminou. Indique um motivo para avaliar antecipadamente.',
  DEADLINE_MUST_BE_LATER: 'O novo prazo tem de ser posterior ao actual.',
  DEADLINE_PASSED: 'O prazo para esta acção terminou.',
  USE_EXTEND_DEADLINE: 'Use a prorrogação de prazo para alterar prazos após a publicação.',
  NOT_INVITED: 'O seu fornecedor não foi convidado para este pedido.',
  OPPORTUNITY_NOT_OPEN: 'O pedido não está aberto para propostas.',
  CURRENCY_MISMATCH: 'A moeda da proposta tem de ser a do pedido.',
  VALIDITY_REQUIRED: 'Indique uma data de validade futura para a proposta.',
  MISSING_REQUIRED_DOCUMENTS: 'Faltam documentos exigidos pelo pedido (aprovados e em vigor).',
  INVALID_ITEM: 'Item inválido.',
  INVALID_AMOUNTS: 'Valores inválidos.',
  ALL_ITEMS_REQUIRED: 'A proposta tem de cobrir todos os itens do pedido.',
  PROPOSAL_ALREADY_SUBMITTED: 'A proposta já foi submetida. Submeta uma nova versão para a rever.',
  DECISION_ALREADY_RECORDED: 'Já existe uma decisão registada para este pedido.',
  INVALID_PROPOSAL: 'Proposta inválida para esta decisão.',
  USER_NOT_FOUND: 'Não existe nenhum utilizador registado com esse e-mail.',
  CANNOT_CHANGE_OWN_ROLES: 'Não pode alterar as suas próprias funções.',
  LAST_ADMIN: 'A organização tem de manter pelo menos um administrador activo.',
  NOT_FOUND: 'Registo não encontrado.',
  IMMUTABLE_RECORD: 'Este registo é histórico e não pode ser alterado.',
  LINES_REQUIRED: 'Adicione pelo menos uma linha ao mapa antes de submeter.',
  CANNOT_REVIEW_OWN_MAP: 'Não pode aprovar nem devolver um mapa que preencheu ou submeteu.',
  DEMO_MODE: 'Operação não disponível nesta instalação.',
}

export function friendlyError(e: unknown): string {
  const msg = typeof e === 'string' ? e : (e as { message?: string })?.message ?? ''
  for (const code of Object.keys(MESSAGES)) {
    if (msg.includes(code)) {
      if (code === 'PROFILE_INCOMPLETE') {
        const m = /PROFILE_INCOMPLETE:\s*([\w,]+)/.exec(msg)
        return m ? `${MESSAGES[code]} Em falta: ${m[1].split(',').join(', ')}.` : MESSAGES[code]
      }
      return MESSAGES[code]
    }
  }
  if (/inspection_map_lines_check/.test(msg)) return 'As quantidades avariadas não podem exceder as contadas.'
  if (/row-level security|permission denied/i.test(msg)) return MESSAGES.PERMISSION_DENIED
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou palavra-passe incorrectos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme o seu e-mail antes de iniciar sessão.'
  if (/already registered|already been registered/i.test(msg)) return 'Já existe uma conta com este e-mail.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem ligação ao servidor. Verifique a internet e tente novamente.'
  return 'Ocorreu um erro inesperado. Tente novamente; se persistir, contacte o suporte.'
}

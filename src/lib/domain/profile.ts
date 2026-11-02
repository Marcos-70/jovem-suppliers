import type { Organization } from './types'

/** Campos obrigatórios por omissão; a lista real vem de platform_settings.profile_required_fields. */
export const DEFAULT_REQUIRED_FIELDS = [
  'legal_name', 'nif', 'sector', 'province', 'municipality', 'address', 'phone',
  'email', 'contact_person', 'description', 'services',
]

export const FIELD_LABEL: Record<string, string> = {
  legal_name: 'Nome legal', nif: 'NIF', sector: 'Sector de actividade', province: 'Província',
  municipality: 'Município', address: 'Morada comercial', phone: 'Telefone', email: 'E-mail profissional',
  contact_person: 'Pessoa de contacto', description: 'Descrição da empresa', services: 'Pelo menos um serviço',
  trade_name: 'Nome comercial', website: 'Website', founded_year: 'Ano de fundação',
  capabilities: 'Capacidades técnicas', commercial_registry: 'Registo comercial', employee_count: 'Número de trabalhadores',
}

/** Mesma regra que public.org_missing_fields no servidor. */
export function missingProfileFields(
  org: Partial<Organization>,
  servicesCount: number,
  required: string[] = DEFAULT_REQUIRED_FIELDS,
): string[] {
  return required.filter((f) => {
    if (f === 'services') return servicesCount === 0
    const v = (org as Record<string, unknown>)[f]
    if (v === null || v === undefined) return true
    if (Array.isArray(v)) return v.length === 0
    return String(v).trim() === ''
  })
}

export const isProfileComplete = (org: Partial<Organization>, servicesCount: number, required?: string[]) =>
  missingProfileFields(org, servicesCount, required).length === 0

import { z } from 'zod'

/** NIF: 10 dígitos (pessoa colectiva) ou 9 dígitos + 2 letras + 3 dígitos. Igual ao servidor. */
export const NIF_REGEX = /^[0-9]{10}$|^[0-9]{9}[A-Z]{2}[0-9]{3}$/
export const isValidNif = (v: string) => NIF_REGEX.test(v.trim().toUpperCase())

const req = (msg = 'Campo obrigatório') => z.string().trim().min(1, msg)
const optional = z.string().trim().optional().or(z.literal(''))

export const passwordSchema = z
  .string()
  .min(10, 'Use pelo menos 10 caracteres')
  .regex(/[A-Za-z]/, 'Inclua letras')
  .regex(/[0-9]/, 'Inclua números')

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  password: req('Introduza a palavra-passe'),
})

export const registerSchema = z
  .object({
    full_name: req('Indique o seu nome').min(3, 'Nome demasiado curto'),
    email: z.string().trim().email('E-mail inválido'),
    password: passwordSchema,
    confirm: z.string(),
    legal_name: req('Indique o nome legal da empresa'),
    trade_name: optional,
    nif: z.string().trim().toUpperCase().refine(isValidNif, 'NIF inválido: 10 dígitos'),
    org_type: z.enum(['supplier', 'buyer', 'both']),
    sector: req('Indique o sector'),
    province: req('Seleccione a província'),
    municipality: req('Indique o município'),
    phone: req('Indique o telefone'),
    accept: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar os termos' }) }),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As palavras-passe não coincidem' })

export const organizationSchema = z.object({
  legal_name: req(), trade_name: optional, nif: z.string().trim().toUpperCase().refine(isValidNif, 'NIF inválido'),
  commercial_registry: optional, org_type: z.enum(['supplier', 'buyer', 'both']),
  sector: optional, province: optional, municipality: optional, address: optional,
  phone: optional, email: z.string().trim().email('E-mail inválido').or(z.literal('')),
  website: z.string().trim().url('Use um endereço completo (https://…)').or(z.literal('')),
  contact_person: optional, description: optional,
  founded_year: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional().or(z.literal('' as unknown as number)),
  employee_count: z.coerce.number().int().min(0).optional().or(z.literal('' as unknown as number)),
  capabilities: optional, certifications_declared: z.string().optional(),
})

export const serviceSchema = z.object({
  name: req('Indique o serviço'), category_id: req('Seleccione a categoria'),
  description: optional, specialties: optional, areas: optional,
})

export const opportunitySchema = z.object({
  title: req('Indique o título').min(3, 'Título demasiado curto'),
  description: optional, category_id: optional, delivery_location: optional,
  deadline: req('Indique o prazo').refine((v) => new Date(v).getTime() > Date.now(), 'O prazo tem de ser futuro'),
  currency: z.string().length(3), commercial_terms: optional, technical_requirements: optional,
  visibility: z.enum(['invited_only', 'open_to_qualified']),
  sealed_until_deadline: z.boolean(),
})

export const itemSchema = z.object({
  description: req('Descreva o item'),
  quantity: z.coerce.number().positive('Quantidade > 0'), unit: req('Unidade'),
  technical_spec: optional,
})

export const proposalSchema = z.object({
  validity_until: req('Indique a validade da proposta'),
  delivery_days: z.coerce.number().int().min(0, 'Prazo inválido'),
  commercial_terms: optional, notes: optional,
  items: z.array(z.object({
    opportunity_item_id: z.string(),
    unit_price: z.coerce.number().min(0, 'Preço ≥ 0'),
    discount_pct: z.coerce.number().min(0).max(100),
    tax_pct: z.coerce.number().min(0).max(100),
  })).min(1),
})

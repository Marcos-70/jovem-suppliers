import { db } from '@/lib/supabase'
import type { UserContext } from '@/lib/domain/types'
import { unwrap } from './core'

export async function signIn(email: string, password: string) {
  const { error } = await db.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

export interface RegistrationInput {
  full_name: string; email: string; password: string
  legal_name: string; trade_name?: string; nif: string; org_type: 'supplier' | 'buyer' | 'both'
  sector: string; province: string; municipality: string; phone: string
}

/**
 * Cria a conta e a organização. Se o projecto exigir confirmação de e-mail,
 * os dados da empresa ficam nos metadados e o utilizador é redirecionado
 * para a URL configurada no ambiente (Vercel ou local).
 */
export async function register(v: RegistrationInput): Promise<{ needsEmailConfirmation: boolean }> {
  const pending = {
    legal_name: v.legal_name,
    trade_name: v.trade_name,
    nif: v.nif,
    org_type: v.org_type,
    sector: v.sector,
    province: v.province,
    municipality: v.municipality,
    phone: v.phone,
    email: v.email,
  }

  // Define dinamicamente o retorno para a URL onde o utilizador se encontra
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const emailRedirectTo = origin ? `${origin}/entrar` : undefined

  const { data, error } = await db.auth.signUp({
    email: v.email.trim(),
    password: v.password,
    options: {
      data: { full_name: v.full_name, pending_org: pending },
      emailRedirectTo,
    },
  })

  if (error) throw error
  if (!data.session) return { needsEmailConfirmation: true }

  await createOrganization(pending)
  return { needsEmailConfirmation: false }
}

export async function createOrganization(p: {
  legal_name: string
  trade_name?: string
  nif: string
  org_type: string
  sector: string
  province: string
  municipality: string
  email: string
  phone: string
}) {
  unwrap(
    await db.rpc('create_organization', {
      p_legal_name: p.legal_name,
      p_trade_name: p.trade_name ?? null,
      p_nif: p.nif.toUpperCase(),
      p_org_type: p.org_type,
      p_sector: p.sector,
      p_province: p.province,
      p_municipality: p.municipality,
      p_email: p.email,
      p_phone: p.phone,
    })
  )
}

export const signOut = () => db.auth.signOut()

export async function requestPasswordReset(email: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const redirectTo = origin ? `${origin}/redefinir-palavra-passe` : undefined

  const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await db.auth.updateUser({ password })
  if (error) throw error
}

export async function loadContext(): Promise<UserContext> {
  return unwrap(await db.rpc('my_context')) as UserContext
}
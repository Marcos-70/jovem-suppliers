/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/supabase'
import { permissionSet } from '@/lib/domain/permissions'
import type { Membership, UserContext } from '@/lib/domain/types'
import { createOrganization, loadContext, signOut as doSignOut } from '@/services/auth'

interface AuthState {
  loading: boolean
  authenticated: boolean
  email: string | null
  ctx: UserContext | null
  activeMembership: Membership | null
  setActiveOrg: (id: string) => void
  perms: Set<string>
  can: (p: string) => boolean
  isSuper: boolean
  isBuyerOrg: boolean
  isSupplierOrg: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)
const ORG_KEY = 'jovem-active-org'

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [ctx, setCtx] = useState<UserContext | null>(null)
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => { try { return sessionStorage.getItem(ORG_KEY) } catch { return null } })

  const hydrate = useCallback(async (session: { user: { id: string; email?: string; user_metadata?: Record<string, any> } } | null) => {
    if (!session) { setCtx(null); setEmail(null); setLoading(false); return }
    setEmail(session.user.email ?? null)
    try {
      let c = await loadContext()
      const pending = session.user.user_metadata?.pending_org
      if (c && c.memberships.length === 0 && pending) {
        try {
          await createOrganization(pending)
          // Limpa pending_org para não tentar em loop se falhar
          await db.auth.updateUser({ data: { pending_org: null } })
          c = await loadContext()
        } catch {
          // Se falhou (ex: NIF em conflito), limpa o metadata para não repetir requisições
          try { await db.auth.updateUser({ data: { pending_org: null } }) } catch { /* ignorar */ }
        }
      }

      // Salvaguarda: se o perfil na BD ainda não existir, cria um objeto seguro em memória
      if (c && !c.profile) {
        c.profile = {
          id: session.user.id,
          full_name: session.user.user_metadata?.full_name || session.user.email || 'Utilizador',
          phone: null,
          job_title: null,
          is_active: true,
        }
      }

      setCtx(c)
    } catch { setCtx(null) }
    setLoading(false)
  }, [])

  useEffect(() => {
    db.auth.getSession().then(({ data }) => hydrate(data.session as never))
    const { data: sub } = db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { qc.clear(); setCtx(null); setEmail(null); setLoading(false); return }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(() => hydrate(session as never), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [hydrate, qc])

  const activeMembership = useMemo(() => {
    if (!ctx?.memberships.length) return null
    return ctx.memberships.find((m) => m.organization_id === activeOrgId) ?? ctx.memberships[0]
  }, [ctx, activeOrgId])

  const perms = useMemo(() => permissionSet(ctx, activeMembership), [ctx, activeMembership])
  const orgType = activeMembership?.organization.org_type
  const value: AuthState = {
    loading, authenticated: !!ctx, email, ctx, activeMembership,
    setActiveOrg: (id) => { try { sessionStorage.setItem(ORG_KEY, id) } catch { /* ignorar */ } setActiveOrgId(id); qc.clear() },
    perms, can: (p) => perms.has(p), isSuper: !!ctx?.is_superadmin,
    isBuyerOrg: orgType === 'buyer' || orgType === 'both', isSupplierOrg: orgType === 'supplier' || orgType === 'both',
    refresh: async () => { const { data } = await db.auth.getSession(); await hydrate(data.session as never) },
    signOut: async () => { await doSignOut(); try { sessionStorage.removeItem(ORG_KEY) } catch { /* ignorar */ } },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
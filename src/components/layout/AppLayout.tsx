import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, Bell, Building2, Briefcase, ChevronDown, FileText, FolderCog, History, Home, LogOut, Menu, Search,
  Settings, ShieldCheck, Users, X, Layers, FileCheck2, UserCog, ClipboardList, ClipboardCheck, ScanLine,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Logo, Spinner, cx } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { P } from '@/lib/domain/permissions'
import { unreadCount } from '@/services/notifications'

interface NavItem { to: string; label: string; icon: ReactNode; show: boolean; end?: boolean }

export default function AppLayout() {
  const a = useAuth()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const uid = a.ctx?.profile.id
  const unread = useQuery({ queryKey: ['unread', uid], queryFn: () => unreadCount(uid as string), enabled: !!uid, refetchInterval: 60_000 })

  if (a.loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>
  if (!a.authenticated) return <Navigate to="/entrar" state={{ from: loc.pathname }} replace />

  const items: NavItem[] = [
    { to: '/app', label: 'Painel', icon: <Home className="h-[18px] w-[18px]" />, show: true, end: true },
    { to: '/app/fornecedores', label: 'Fornecedores', icon: <Search className="h-[18px] w-[18px]" />, show: a.can(P.supplierSearch) },
    { to: '/app/empresa', label: 'A minha empresa', icon: <Building2 className="h-[18px] w-[18px]" />, show: !!a.activeMembership && a.can(P.orgView) },
    { to: '/app/documentos', label: 'Documentos', icon: <FileText className="h-[18px] w-[18px]" />, show: !!a.activeMembership && a.can(P.docView) },
    { to: '/app/pedidos', label: 'Pedidos de cotação', icon: <Briefcase className="h-[18px] w-[18px]" />, show: !!a.activeMembership && a.can(P.oppView) },
    { to: '/app/propostas', label: 'Propostas', icon: <ClipboardList className="h-[18px] w-[18px]" />, show: !!a.activeMembership && a.isSupplierOrg && a.can(P.propView) },
    { to: '/app/inspeccoes', label: 'Mapas de inspecção', icon: <ClipboardCheck className="h-[18px] w-[18px]" />, show: !!a.activeMembership && a.can(P.inspView) },
    { to: '/app/smart-hold-scan', label: 'SMART HOLD SCAN', icon: <ScanLine className="h-[18px] w-[18px]" />, show: !!a.activeMembership && a.can(P.scanView) },
    { to: '/app/relatorios', label: 'Relatórios', icon: <BarChart3 className="h-[18px] w-[18px]" />, show: a.can(P.reportView) },
    { to: '/app/equipa', label: 'Equipa e funções', icon: <Users className="h-[18px] w-[18px]" />, show: !!a.activeMembership && a.can(P.membersManage) },
    { to: '/app/auditoria', label: 'Auditoria', icon: <History className="h-[18px] w-[18px]" />, show: a.can(P.auditView) },
  ].filter((i) => i.show)
  const admin: NavItem[] = [
    { to: '/app/admin', label: 'Visão global', icon: <Layers className="h-[18px] w-[18px]" />, show: a.can(P.adminAccess), end: true },
    { to: '/app/admin/organizacoes', label: 'Organizações', icon: <ShieldCheck className="h-[18px] w-[18px]" />, show: a.can(P.adminOrgs) },
    { to: '/app/admin/documentos', label: 'Revisão documental', icon: <FileCheck2 className="h-[18px] w-[18px]" />, show: a.can(P.docReview) },
    { to: '/app/admin/utilizadores', label: 'Utilizadores', icon: <UserCog className="h-[18px] w-[18px]" />, show: a.can(P.adminUsers) },
    { to: '/app/admin/configuracoes', label: 'Configurações', icon: <FolderCog className="h-[18px] w-[18px]" />, show: a.can(P.adminConfig) },
  ].filter((i) => i.show)

  const link = (i: NavItem) => (
    <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}
      className={({ isActive }) => cx('relative flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-semibold !text-white/80 transition-colors hover:bg-white/5 hover:!text-white', isActive && 'bg-navy-800 !text-white before:absolute before:inset-y-1.5 before:-left-3 before:w-1 before:rounded-r before:bg-gold')}>
      {i.icon}{i.label}
    </NavLink>
  )

  const nav = (
    <nav aria-label="Navegação principal" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map(link)}
      {admin.length > 0 && <><p className="px-3 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold/80">Administração JOVEM+</p>{admin.map(link)}</>}
      <p className="px-3 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">Conta</p>
      <NavLink to="/app/notificacoes" onClick={() => setOpen(false)} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium !text-white/80 hover:bg-white/5 hover:!text-white', isActive && 'bg-navy-700 !text-white')}><Bell className="h-[18px] w-[18px]" />Notificações{!!unread.data && <span className="ml-auto rounded-full bg-gold px-2 text-xs font-bold text-navy">{unread.data}</span>}</NavLink>
      {link({ to: '/app/definicoes', label: 'Definições', icon: <Settings className="h-[18px] w-[18px]" />, show: true })}
      {link({ to: '/app/modulos', label: 'Módulos', icon: <Layers className="h-[18px] w-[18px]" />, show: true })}
    </nav>
  )
  const signOutBtn = <div className="border-t border-white/10 p-3"><button onClick={() => a.signOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium text-white/80 hover:bg-white/5 hover:text-white"><LogOut className="h-[18px] w-[18px]" aria-hidden />Sair</button></div>

  const m = a.activeMembership
  return (
    <div className="min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2">Saltar para o conteúdo</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy print:hidden lg:flex">
        <div className="flex h-[68px] items-center border-b border-white/10 px-5"><Link to="/app" aria-label="Painel"><Logo light /></Link></div>
        {nav}{signOutBtn}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 print:hidden lg:hidden">
          <div className="absolute inset-0 bg-navy-900/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-navy">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-5"><Logo light /><button aria-label="Fechar menu" onClick={() => setOpen(false)} className="text-white"><X /></button></div>
            {nav}{signOutBtn}
          </aside>
        </div>
      )}
      <div className="lg:pl-64 print:pl-0">
          <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-navy-800 bg-navy px-4 text-white backdrop-blur print:hidden sm:px-6 lg:border-line lg:bg-white lg:text-ink">
          <button className="rounded-lg p-2 lg:hidden" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu /></button>
          <Link to="/app" className="lg:hidden" aria-label="Painel"><Logo light size={30} /></Link>
          <div className="min-w-0 flex-1">
            {a.ctx && a.ctx.memberships.length > 1 ? (
              <label className="flex items-center gap-2 text-sm"><span className="sr-only">Organização activa</span>
                <select className="input max-w-xs !min-h-[36px] font-semibold" value={m?.organization_id} onChange={(e) => a.setActiveOrg(e.target.value)}>
                  {a.ctx.memberships.map((x) => <option key={x.organization_id} value={x.organization_id}>{x.organization.trade_name || x.organization.legal_name}</option>)}
                </select></label>
            ) : (
              <p className="hidden truncate font-display text-[15px] font-semibold text-navy lg:block">{m ? m.organization.trade_name || m.organization.legal_name : a.isSuper ? 'Administração da plataforma' : 'Sem organização'}</p>
            )}
          </div>
          <Link to="/app/notificacoes" className="relative rounded-lg p-2 text-white hover:bg-white/10 lg:text-ink-soft lg:hover:bg-surface" aria-label={`Notificações${unread.data ? `: ${unread.data} por ler` : ''}`}>
            <Bell className="h-5 w-5" />{!!unread.data && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread.data}</span>}
          </Link>
          <div className="relative">
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10 lg:hover:bg-surface" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gold text-sm font-bold text-navy" aria-hidden>{(a.ctx?.profile.full_name || a.email || '?').slice(0, 1).toUpperCase()}</span>
              <span className="hidden max-w-[160px] truncate text-sm font-semibold sm:block lg:text-navy">{a.ctx?.profile.full_name || a.email}</span><ChevronDown className="h-4 w-4 text-ink-mute" aria-hidden />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-1 w-56 rounded-card border border-line bg-white py-1 shadow-pop" onMouseLeave={() => setMenu(false)}>
                <p className="truncate px-3 py-2 text-xs text-ink-mute">{a.email}</p>
                <Link role="menuitem" to="/app/definicoes" onClick={() => setMenu(false)} className="block px-3 py-2 text-[15px] !text-ink hover:bg-surface">Definições da conta</Link>
                <button role="menuitem" onClick={() => a.signOut()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[15px] text-danger hover:bg-surface"><LogOut className="h-4 w-4" />Terminar sessão</button>
              </div>
            )}
          </div>
        </header>
        <main id="conteudo" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8"><Outlet /></main>
      </div>
    </div>
  )
}

/** Protege rotas por permissão. Sem permissão mostra uma explicação, não uma página em branco. */
export function RequirePerm({ perm, children, anyOf, needsOrg, orgKind }: { perm?: string; anyOf?: string[]; needsOrg?: boolean; orgKind?: 'buyer' | 'supplier'; children: ReactNode }) {
  const a = useAuth()
  const ok = (perm ? a.can(perm) : true) && (anyOf ? anyOf.some((p) => a.can(p)) : true) && (!needsOrg || !!a.activeMembership) && (!orgKind || (orgKind === 'buyer' ? a.isBuyerOrg : a.isSupplierOrg))
  if (ok) return <>{children}</>
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-ink-mute" aria-hidden />
      <h1 className="mt-3 text-xl font-bold">Sem permissão</h1>
      <p className="mt-1 text-ink-soft">A sua função actual não permite aceder a esta área. Se precisa de acesso, peça ao administrador da sua organização.</p>
      <Link to="/app" className="btn-primary mt-5">Voltar ao painel</Link>
    </div>
  )
}

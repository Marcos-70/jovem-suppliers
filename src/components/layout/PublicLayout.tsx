import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Logo, cx } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const links = [
  { to: '/fornecedores-publico', label: 'Procurar fornecedores' },
  { to: '/#como-funciona', label: 'Como funciona' },
  { to: '/planos', label: 'Planos' },
]

export default function PublicLayout() {
  const [open, setOpen] = useState(false)
  const { authenticated } = useAuth()
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2">Saltar para o conteúdo</a>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Jovem+ SUPPLIERS — página inicial"><Logo light /></Link>
          <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
            {links.map((l) => <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('rounded-lg px-3 py-2 text-[15px] font-semibold !text-white/80 hover:!text-white', isActive && l.to.startsWith('/f') && '!text-gold')}>{l.label}</NavLink>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {authenticated ? <Link to="/app" className="btn-primary">Ir para o painel</Link> : (<><Link to="/entrar" className="btn !text-white hover:bg-white/10">Entrar</Link><Link to="/registar" className="btn-primary">Registar empresa</Link></>)}
          </div>
          <button className="rounded-lg p-2 text-white md:hidden" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
        {open && (
          <div className="border-t border-white/10 bg-navy px-4 pb-4 md:hidden">
            {links.map((l) => <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block py-2.5 font-semibold !text-white">{l.label}</Link>)}
            <div className="mt-2 flex gap-2">{authenticated ? <Link to="/app" className="btn-primary flex-1">Painel</Link> : (<><Link to="/entrar" className="btn flex-1 border border-white/30 !text-white">Entrar</Link><Link to="/registar" className="btn-primary flex-1">Registar</Link></>)}</div>
          </div>
        )}
      </header>
      <main id="conteudo" className="flex-1"><Outlet /></main>
      <footer className="bg-navy-900 text-white/80">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
          <div><Logo light /><p className="mt-4 max-w-sm text-sm">Juntos por um futuro com mais oportunidades. Plataforma B2B que liga fornecedores angolanos a grandes empresas, com qualificação, pedidos de cotação e propostas rastreáveis.</p></div>
          <nav aria-label="Rodapé" className="text-sm"><p className="mb-2 font-display font-semibold text-gold">Plataforma</p><ul className="space-y-1.5"><li><Link className="!text-white/80 hover:!text-white" to="/fornecedores-publico">Procurar fornecedores</Link></li><li><Link className="!text-white/80 hover:!text-white" to="/registar">Registar empresa</Link></li><li><Link className="!text-white/80 hover:!text-white" to="/entrar">Entrar</Link></li><li><Link className="!text-white/80 hover:!text-white" to="/planos">Planos</Link></li></ul></nav>
          <nav aria-label="Legal" className="text-sm"><p className="mb-2 font-display font-semibold text-gold">Legal</p><ul className="space-y-1.5"><li><Link className="!text-white/80 hover:!text-white" to="/termos">Termos de utilização</Link></li><li><Link className="!text-white/80 hover:!text-white" to="/privacidade">Política de privacidade</Link></li></ul></nav>
        </div>
        <div className="border-t border-white/10 bg-navy py-3 text-center text-xs text-white/70">Jovem+ Business &nbsp;|&nbsp; Jovem+ Suppliers &nbsp;|&nbsp; Plataforma B2B &nbsp;|&nbsp; Angola – África &nbsp;·&nbsp; © {new Date().getFullYear()}</div>
      </footer>
    </div>
  )
}

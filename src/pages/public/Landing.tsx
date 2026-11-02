import { ArrowRight, ArrowDown, Building2, ClipboardCheck, FileCheck2, Gavel, Handshake, Droplets, Layers, LayoutDashboard, Search, ShieldCheck, Settings2, UserRoundCheck, Users, Briefcase, FileText, ScanLine, BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RigScene } from '@/assets/RigScene'
import { Badge, Logo } from '@/components/ui'

const strip = [
  { i: <Users />, t: 'Fornecedores', d: 'Cadastra, pesquisa e avalia fornecedores qualificados.' },
  { i: <FileText />, t: 'Documentação', d: 'Organiza certificados, licenças e documentos com validade.' },
  { i: <Handshake />, t: 'Oportunidades', d: 'Acesso a oportunidades comerciais e pedidos de proposta.' },
  { i: <BarChart3 />, t: 'Propostas', d: 'Acompanha e gere propostas comerciais com histórico.' },
  { i: <ClipboardCheck />, t: 'Mapas de inspecção', d: 'Controlo de mercadorias digital, no telemóvel do inspector.' },
  { i: <Settings2 />, t: 'Gestão empresarial', d: 'Perfil, utilizadores, funções e configurações.' },
]

function Ficha() {
  const rows: { t: string; s: string; tone: 'ok' | 'warn' | 'danger' | 'info' }[] = [
    { t: 'Registo comercial', s: 'Válido e aprovado', tone: 'ok' }, { t: 'Comprovativo fiscal (NIF)', s: 'Válido e aprovado', tone: 'ok' },
    { t: 'Seguro de responsabilidade', s: 'Próximo da validade', tone: 'warn' }, { t: 'Certificação de qualidade', s: 'Expirado', tone: 'danger' }, { t: 'Licença de actividade', s: 'Em análise', tone: 'info' },
  ]
  return (
    <figure className="overflow-hidden rounded-[14px] border-[6px] border-navy-900 bg-white shadow-pop" aria-label="Exemplo ilustrativo de uma ficha de qualificação">
      <div className="flex items-center justify-between bg-navy px-4 py-2.5 text-white"><span className="font-display text-sm font-semibold">Ficha de qualificação</span><span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-semibold">Exemplo</span></div>
      <ul className="divide-y divide-line">{rows.map((r) => <li key={r.t} className="flex items-center justify-between gap-2 px-4 py-2.5"><span className="text-[13px] font-semibold text-navy">{r.t}</span><Badge tone={r.tone}>{r.s}</Badge></li>)}</ul>
      <figcaption className="border-t border-line bg-surface px-4 py-2 text-[11px] text-ink-mute">Exemplo ilustrativo — não representa uma empresa real.</figcaption>
    </figure>
  )
}

function PhoneMock() {
  const tiles = [{ i: <Users />, t: 'Fornecedores' }, { i: <Briefcase />, t: 'Pedidos' }, { i: <FileText />, t: 'Propostas' }, { i: <FileCheck2 />, t: 'Documentos' }, { i: <ClipboardCheck />, t: 'Inspecções' }, { i: <ScanLine />, t: 'Hold Scan' }]
  return (
    <div className="mx-auto w-[210px] rounded-[30px] border-[7px] border-navy-900 bg-white shadow-pop" aria-label="Exemplo ilustrativo do ecrã inicial no telemóvel" role="img">
      <div className="rounded-t-[22px] bg-navy px-3 pb-3 pt-4"><Logo light size={22} /><p className="mt-3 text-sm font-bold text-white">Olá, bem-vindo</p><p className="text-[11px] text-white/70">Bem-vindo de volta!</p></div>
      <div className="grid grid-cols-3 gap-2 p-3">{tiles.map((t) => <div key={t.t} className="flex flex-col items-center gap-1 rounded-lg bg-navy-800 py-2.5 text-[10px] font-semibold text-white [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-gold"><span aria-hidden>{t.i}</span>{t.t}</div>)}</div>
      <p className="px-3 pb-3 text-[10px] text-ink-mute">Exemplo ilustrativo.</p>
    </div>
  )
}

export default function Landing() {
  return (
    <>
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <RigScene className="absolute inset-y-0 right-0 h-full w-full opacity-90 lg:w-[62%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-900 via-navy-900/85 to-navy-900/10 lg:via-navy-900/70" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div>
            <h1 className="text-[36px] font-bold leading-[1.1] !text-white sm:text-[48px]">Conectando fornecedores angolanos a grandes empresas.</h1>
            <p className="mt-5 text-lg font-semibold text-gold">Mais oportunidades. Mais negócios.</p>
            <p className="mt-1 max-w-xl text-lg text-white/85">Um futuro melhor para os jovens e para Angola. Uma plataforma digital que facilita a descoberta, a verificação documental e a gestão de oportunidades comerciais no sector petrolífero.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Link to="/registar" className="btn-primary !min-h-[50px] px-6 text-base"><Building2 className="h-5 w-5" aria-hidden />Registar a minha empresa <ArrowRight className="h-4 w-4" aria-hidden /></Link><Link to="/fornecedores-publico" className="btn !min-h-[50px] border border-white/40 px-6 text-base !text-white hover:bg-white/10"><Search className="h-5 w-5" aria-hidden />Procurar fornecedores</Link></div>
            <p className="mt-6 flex flex-wrap gap-3 text-sm text-white/90"><span className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1.5"><Layers className="h-4 w-4 text-gold" aria-hidden />Plataforma B2B</span><span className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1.5"><Droplets className="h-4 w-4 text-gold" aria-hidden />Foco no sector petrolífero e grandes projectos</span></p>
          </div>
          <div className="relative hidden min-h-[330px] lg:block"><div className="absolute right-[24%] top-0 w-[360px]"><Ficha /></div><div className="absolute bottom-[-10px] right-0"><PhoneMock /></div></div>
        </div>
        <div className="relative border-t border-white/10 bg-navy-900/85 backdrop-blur"><ul className="mx-auto grid max-w-7xl gap-px px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-6">{strip.map((s) => (
          <li key={s.t} className="flex gap-3 px-3 py-5"><span className="mt-0.5 text-gold [&_svg]:h-7 [&_svg]:w-7" aria-hidden>{s.i}</span><div><p className="font-display font-semibold text-white">{s.t}</p><p className="mt-0.5 text-[13px] leading-snug text-white/75">{s.d}</p></div></li>))}</ul></div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-[30px] font-bold">Fluxo de funcionamento</h2>
        <p className="mt-2 max-w-2xl text-ink-soft">Cada passo deixa registo. Fornecedores sabem o que falta; compradores sabem em que podem confiar.</p>
        <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {[
            { head: 'Grande empresa (compradora)', icon: <Building2 />, cls: 'bg-navy text-white', items: ['Publica oportunidades', 'Procura fornecedores', 'Avalia propostas e decide'] },
            { head: 'Jovem+ Suppliers (plataforma)', icon: <LayoutDashboard />, cls: 'bg-gold text-navy', items: ['Organiza perfis', 'Verifica documentos', 'Facilita a comunicação e o registo'] },
            { head: 'Fornecedor angolano', icon: <UserRoundCheck />, cls: 'bg-navy text-white', items: ['Regista a empresa', 'Apresenta serviços e produtos', 'Submete propostas'] },
          ].flatMap((c, i, arr) => [
            <div key={c.head} className="card overflow-hidden"><div className={`flex items-center gap-3 px-5 py-4 ${c.cls}`}><span className="[&_svg]:h-7 [&_svg]:w-7" aria-hidden>{c.icon}</span><h3 className={`text-base font-semibold ${c.cls.includes('gold') ? '!text-navy' : '!text-white'}`}>{c.head}</h3></div><ul className="space-y-2 p-5 text-[15px]">{c.items.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />{x}</li>)}</ul></div>,
            i < arr.length - 1 && <div key={`a${i}`} className="grid place-items-center text-navy" aria-hidden><ArrowRight className="hidden h-7 w-7 lg:block" /><ArrowDown className="h-7 w-7 lg:hidden" /></div>,
          ])}
        </div>
        <h2 className="mt-14 text-[24px] font-bold">Estados do fornecedor</h2>
        <ol className="relative mt-6 grid gap-5 sm:grid-cols-3"><div className="pipe absolute left-[12%] right-[12%] top-6 hidden h-1 sm:block" aria-hidden />
          {[{ i: <FileText />, t: 'Registo', d: 'Empresa criada e perfil preenchido.' }, { i: <ClipboardCheck />, t: 'Documentação', d: 'Documentos carregados e analisados.' }, { i: <ShieldCheck />, t: 'Aprovado', d: 'Perfil aprovado: apto para oportunidades.' }].map((s) => (
            <li key={s.t} className="relative text-center"><span className="relative z-10 mx-auto grid h-12 w-12 place-items-center rounded-full border-[3px] border-gold bg-white text-navy [&_svg]:h-5 [&_svg]:w-5" aria-hidden>{s.i}</span><h3 className="mt-2 text-lg font-semibold">{s.t}</h3><p className="text-[15px] text-ink-soft">{s.d}</p></li>))}</ol>
      </section>

      <section className="bg-navy py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-[30px] font-bold !text-white">Por que escolher a Jovem+ Suppliers?</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              { t: 'Por que escolher', l: ['Maior visibilidade para o seu negócio', 'Ligação directa a grandes empresas', 'Processo simples e seguro', 'Apoio ao desenvolvimento de fornecedores angolanos'] },
              { t: 'Público-alvo', l: ['Empresas petrolíferas e grandes projectos', 'Fornecedores angolanos', 'PMEs e prestadores de serviços', 'Empresas de inspecção e controlo de mercadorias'] },
              { t: 'Impacto', l: ['Mais negócios', 'Mais empregos', 'Mais desenvolvimento', 'Uma Angola mais forte'] },
            ].map((c) => (
              <div key={c.t} className="rounded-card border border-white/15 bg-white/[0.05] p-6"><h3 className="text-xl font-semibold !text-gold">{c.t}</h3><ul className="mt-4 space-y-2.5">{c.l.map((x) => <li key={x} className="flex gap-2.5 text-[15px] text-white/90"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />{x}</li>)}</ul></div>))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-3">{[{ i: <ShieldCheck />, t: 'Privado por omissão', d: 'Cada empresa escolhe o que mostra e a quem.' }, { i: <Gavel />, t: 'Decisão com fundamento', d: 'Cada decisão comercial fica registada e justificada.' }, { i: <ClipboardCheck />, t: 'Tudo rastreável', d: 'Alterações críticas ficam em auditoria.' }].map((x) => (
          <div key={x.t} className="card p-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-gold-50 text-gold-700 [&_svg]:h-5 [&_svg]:w-5" aria-hidden>{x.i}</span><h3 className="mt-3 text-lg font-semibold">{x.t}</h3><p className="mt-1 text-[15px] text-ink-soft">{x.d}</p></div>))}</div>
      </section>

      <section className="border-t border-line bg-white py-14"><div className="mx-auto max-w-3xl px-4 text-center sm:px-6"><h2 className="text-[28px] font-bold">Juntos criamos oportunidades reais para empresas angolanas.</h2><p className="mt-2 text-ink-soft">O registo demora poucos minutos. Complete o perfil ao seu ritmo.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link to="/registar" className="btn-primary !min-h-[48px] px-6 text-base">Registar empresa</Link><Link to="/entrar" className="btn-secondary !min-h-[48px] px-6 text-base">Já tenho conta</Link></div></div></section>
    </>
  )
}

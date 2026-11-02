import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Briefcase, Building2, CalendarClock, ClipboardCheck, ClipboardList, FileCheck2, FileClock, FileText, Gavel, ScanLine, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActivityLine, BarsCard } from '@/components/Charts'
import { Alert, Badge, EmptyState, ErrorState, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useReportData } from '@/hooks/useReportData'
import { effectiveDocStatus } from '@/lib/domain/documents'
import { formatDateTime, formatPercent } from '@/lib/domain/format'
import { INSPECTION_STATUS, OPP_STATUS, PROFILE_STATUS } from '@/lib/domain/labels'
import { finalDeadline, timeLeft } from '@/lib/domain/opportunity'
import { missingProfileFields } from '@/lib/domain/profile'
import { conversionRate, countByEffectiveDocStatus, documentComplianceRate, profileCompletionRate, responseRate, activeSuppliers, type ReportData } from '@/lib/domain/reports'
import { P } from '@/lib/domain/permissions'
import { getOrganization, listServices } from '@/services/organizations'
import { listDocuments } from '@/services/documents'
import { listOpportunities } from '@/services/opportunities'
import { listProposals } from '@/services/proposals'
import { listInspectionMaps } from '@/services/inspections'
import { useSettings } from '@/hooks/useCatalog'
import { DEFINITIONS } from '@/lib/domain/reports'

const stamp = (d: Date) => <p className="mt-2 text-xs text-ink-mute">Posição em {formatDateTime(d)}</p>

export default function Dashboard() {
  const a = useAuth()
  if (a.isSuper) return <AdminDashboard />
  if (!a.activeMembership) return (
    <><PageHeader title="Painel" /><div className="card"><EmptyState icon={<Building2 />} title="Ainda não está associado a uma organização" action={<Link to="/app/definicoes" className="btn-primary">Ver a minha conta</Link>}>Peça ao administrador da sua empresa para o adicionar, ou registe uma nova empresa.</EmptyState></div></>
  )
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Olá, ${a.ctx?.profile.full_name.split(' ')[0] || 'bem-vindo'}. Aqui está um resumo da actividade de ${a.activeMembership.organization.trade_name || a.activeMembership.organization.legal_name} na plataforma.`} />
      <QuickTiles />
      <div className="space-y-8">
        {a.isSupplierOrg && (a.can(P.docView) || a.can(P.propView)) && <SupplierSection />}
        {a.isBuyerOrg && a.can(P.oppView) && <BuyerSection />}
        {a.can(P.inspView) && <InspectionSection />}
      </div>
    </>
  )
}

/** Atalhos em grelha (como no ecrã inicial móvel): só opções permitidas. */
function QuickTiles() {
  const a = useAuth()
  const t = [
    { to: '/app/fornecedores', i: <Users />, l: 'Fornecedores', ok: a.can(P.supplierSearch) }, { to: '/app/pedidos', i: <Briefcase />, l: 'Pedidos', ok: a.can(P.oppView) },
    { to: '/app/propostas', i: <FileText />, l: 'Propostas', ok: a.isSupplierOrg && a.can(P.propView) }, { to: '/app/documentos', i: <FileCheck2 />, l: 'Documentos', ok: a.can(P.docView) },
    { to: '/app/inspeccoes', i: <ClipboardCheck />, l: 'Inspecções', ok: a.can(P.inspView) }, { to: '/app/smart-hold-scan', i: <ScanLine />, l: 'Hold Scan', ok: a.can(P.scanView) },
  ].filter((x) => x.ok)
  if (!t.length) return null
  return <nav aria-label="Atalhos" className="mb-6 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:hidden">{t.map((x) => <Link key={x.to} to={x.to} className="flex flex-col items-center gap-1.5 rounded-xl bg-navy px-2 py-3.5 text-center text-[12px] font-semibold !text-white [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-gold"><span aria-hidden>{x.i}</span>{x.l}</Link>)}</nav>
}

function RecentOpps({ opps }: { opps: { id: string; title: string; number: string; status: keyof typeof OPP_STATUS }[] }) {
  return (
    <div className="card card-pad"><div className="mb-3 flex items-center justify-between"><h3 className="section-title !text-base">Oportunidades recentes</h3><Link to="/app/pedidos" className="kbd-link text-sm">Ver todas</Link></div>
      {opps.length === 0 ? <p className="text-ink-soft">Ainda sem pedidos.</p> : <ul className="divide-y divide-line">{opps.slice(0, 5).map((o) => <li key={o.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><Link to={`/app/pedidos/${o.id}`} className="kbd-link block truncate">{o.title}</Link><p className="text-xs text-ink-mute">{o.number}</p></div><StatusBadge label={OPP_STATUS[o.status]} /></li>)}</ul>}</div>
  )
}

function InspectionSection() {
  const a = useAuth()
  const q = useQuery({ queryKey: ['inspections'], queryFn: listInspectionMaps })
  if (q.isLoading) return <Spinner />
  const maps = q.data ?? [], n = (s: string) => maps.filter((m) => m.status === s).length
  const mine = maps.filter((m) => m.created_by === a.ctx?.profile.id || m.inspector_id === a.ctx?.profile.id)
  return (
    <section aria-labelledby="sec-insp"><h2 id="sec-insp" className="section-title mb-3">Mapas de inspecção</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Em preenchimento" value={n('draft') + n('returned')} icon={<ClipboardCheck className="h-5 w-5" />} tone={n('returned') ? 'warn' : 'neutral'} hint={n('returned') ? `${n('returned')} devolvido(s) para correcção` : 'Rascunhos e devolvidos'} />
        <StatCard label="A aguardar revisão" value={n('submitted')} icon={<FileClock className="h-5 w-5" />} tone={n('submitted') ? 'info' : 'neutral'} /><StatCard label="Aprovados" value={n('approved')} icon={<ShieldCheck className="h-5 w-5" />} tone="ok" /><StatCard label="Os meus mapas" value={mine.length} icon={<Users className="h-5 w-5" />} /></div>
      <div className="card card-pad mt-4"><div className="mb-3 flex items-center justify-between"><h3 className="section-title !text-base">Mapas recentes</h3><Link to="/app/inspeccoes" className="kbd-link text-sm">Ver todos</Link></div>
        {maps.length === 0 ? <p className="text-ink-soft">Ainda sem mapas.</p> : <ul className="divide-y divide-line">{maps.slice(0, 5).map((m) => <li key={m.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><Link to={`/app/inspeccoes/${m.id}`} className="kbd-link block truncate">{m.title}</Link><p className="text-xs text-ink-mute">{m.number}</p></div><StatusBadge label={INSPECTION_STATUS[m.status]} /></li>)}</ul>}</div>
    </section>
  )
}

function SupplierSection() {
  const a = useAuth()
  const orgId = a.activeMembership!.organization_id
  const org = useQuery({ queryKey: ['org', orgId], queryFn: () => getOrganization(orgId), enabled: a.can(P.orgView) })
  const services = useQuery({ queryKey: ['services', orgId], queryFn: () => listServices(orgId) })
  const docs = useQuery({ queryKey: ['docs', orgId], queryFn: () => listDocuments(orgId), enabled: a.can(P.docView) })
  const opps = useQuery({ queryKey: ['opps'], queryFn: listOpportunities, enabled: a.can(P.oppView) })
  const props = useQuery({ queryKey: ['proposals', orgId], queryFn: () => listProposals(orgId), enabled: a.can(P.propView) })
  const settings = useSettings()
  if (org.isLoading || docs.isLoading || opps.isLoading) return <Spinner />
  if (org.isError) return <ErrorState error={org.error} retry={() => org.refetch()} />
  const required = (settings.data?.profile_required_fields as string[] | undefined)
  const miss = org.data ? missingProfileFields(org.data, services.data?.length ?? 0, required) : []
  const now = new Date()
  const dc = { approved: 0, expiring: 0, expired: 0, pending: 0, problems: 0 }
  ;(docs.data ?? []).forEach((d) => { const s = effectiveDocStatus(d, now); if (s === 'approved') dc.approved++; else if (s === 'expiring') dc.expiring++; else if (s === 'expired') dc.expired++; else if (['submitted', 'under_review'].includes(s)) dc.pending++; else if (['rejected', 'correction_pending'].includes(s)) dc.problems++ })
  const myProps = new Map((props.data ?? []).map((p) => [p.opportunity_id, p]))
  const toAnswer = (opps.data ?? []).filter((o) => ['open', 'clarification'].includes(o.status) && o.buyer_org_id !== orgId && !['submitted', 'in_evaluation', 'selected'].includes(myProps.get(o.id)?.status ?? '') && new Date(o.deadline) > now)
    .sort((x, y) => +new Date(x.deadline) - +new Date(y.deadline))
  const submitted = (props.data ?? []).filter((p) => ['submitted', 'in_evaluation'].includes(p.status)).length
  const tasks: { tone: 'warn' | 'danger' | 'info'; text: React.ReactNode }[] = []
  if (org.data && ['draft', 'incomplete', 'corrections_pending'].includes(org.data.profile_status)) tasks.push({ tone: org.data.profile_status === 'corrections_pending' ? 'danger' : 'warn', text: <>O perfil está <strong>{PROFILE_STATUS[org.data.profile_status].text.toLowerCase()}</strong>{miss.length ? ` (faltam ${miss.length} campos)` : ''}. <Link to="/app/empresa" className="kbd-link">Completar perfil</Link></> })
  if (dc.expired) tasks.push({ tone: 'danger', text: <>{dc.expired} documento(s) expirado(s). <Link to="/app/documentos" className="kbd-link">Submeter nova versão</Link></> })
  if (dc.expiring) tasks.push({ tone: 'warn', text: <>{dc.expiring} documento(s) próximo(s) da validade. <Link to="/app/documentos" className="kbd-link">Rever documentos</Link></> })
  if (dc.problems) tasks.push({ tone: 'danger', text: <>{dc.problems} documento(s) com correcção pedida ou rejeitado(s). <Link to="/app/documentos" className="kbd-link">Ver motivos</Link></> })
  return (
    <section aria-labelledby="sec-forn">
      <h2 id="sec-forn" className="section-title mb-3">Como fornecedor</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Estado do perfil" value={org.data ? PROFILE_STATUS[org.data.profile_status].text : '—'} icon={<Building2 className="h-5 w-5" />} tone={org.data?.profile_status === 'approved' ? 'ok' : 'warn'} hint={miss.length ? `${miss.length} campo(s) em falta` : 'Campos obrigatórios completos'} />
        <StatCard label="Documentos válidos" value={dc.approved} icon={<FileCheck2 className="h-5 w-5" />} tone="ok" hint={`${dc.pending} em análise · ${dc.expiring} a expirar · ${dc.expired} expirados`} />
        <StatCard label="Pedidos por responder" value={toAnswer.length} icon={<Briefcase className="h-5 w-5" />} tone={toAnswer.length ? 'info' : 'neutral'} hint="Convites abertos, dentro do prazo" />
        <StatCard label="Propostas submetidas" value={submitted} icon={<ClipboardList className="h-5 w-5" />} hint="Submetidas ou em avaliação" />
      </div>
      {stamp(now)}
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><ActivityLine title="Actividade dos últimos 30 dias" dates={(props.data ?? []).map((p) => p.submitted_at)} label="Propostas submetidas" /><RecentOpps opps={(opps.data ?? []).filter((o) => o.buyer_org_id !== orgId)} /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="card card-pad">
          <h3 className="section-title !text-base mb-3">O que fazer a seguir</h3>
          {tasks.length === 0 ? <p className="flex items-center gap-2 text-ink-soft"><ShieldCheck className="h-5 w-5 text-ok" aria-hidden />Tudo em ordem por agora.</p> : <ul className="space-y-2">{tasks.map((t, i) => <li key={i}><Alert tone={t.tone}>{t.text}</Alert></li>)}</ul>}
        </div>
        <div className="card card-pad">
          <h3 className="section-title !text-base mb-3">Pedidos a terminar</h3>
          {toAnswer.length === 0 ? <p className="text-ink-soft">Sem pedidos abertos para responder.</p> : (
            <ul className="divide-y divide-line">{toAnswer.slice(0, 5).map((o) => {
              const d = finalDeadline(o, [])
              return <li key={o.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><Link to={`/app/pedidos/${o.id}`} className="kbd-link block truncate">{o.title}</Link><p className="text-xs text-ink-mute">{o.number} · até {formatDateTime(o.deadline)}</p></div><Badge tone={d.getTime() - now.getTime() < 48 * 3_600_000 ? 'warn' : 'info'}><CalendarClock className="h-3 w-3" aria-hidden />{timeLeft(d, now)}</Badge></li>
            })}</ul>
          )}
        </div>
      </div>
    </section>
  )
}

function BuyerSection() {
  const a = useAuth()
  const orgId = a.activeMembership!.organization_id
  const opps = useQuery({ queryKey: ['opps'], queryFn: listOpportunities })
  const rd = useReportData(a.can(P.reportView))
  if (opps.isLoading) return <Spinner />
  if (opps.isError) return <ErrorState error={opps.error} retry={() => opps.refetch()} />
  const mine = (opps.data ?? []).filter((o) => o.buyer_org_id === orgId)
  const now = new Date()
  const by = (s: string[]) => mine.filter((o) => s.includes(o.status)).length
  const closing = mine.filter((o) => ['open', 'clarification'].includes(o.status) && new Date(o.deadline).getTime() - now.getTime() < 7 * 86_400_000 && new Date(o.deadline) > now).sort((x, y) => +new Date(x.deadline) - +new Date(y.deadline))
  const toDecide = mine.filter((o) => o.status === 'under_evaluation')
  const data = Object.entries(OPP_STATUS).map(([k, l]) => ({ name: l.text, value: mine.filter((o) => o.status === k).length })).filter((d) => d.value > 0)
  const d: ReportData | undefined = rd.data
  return (
    <section aria-labelledby="sec-comp">
      <h2 id="sec-comp" className="section-title mb-3">Como empresa compradora</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pedidos abertos" value={by(['open', 'clarification', 'published', 'invites_sent'])} icon={<Briefcase className="h-5 w-5" />} tone="info" hint="A receber propostas" />
        <StatCard label="Em avaliação" value={toDecide.length} icon={<Gavel className="h-5 w-5" />} tone={toDecide.length ? 'warn' : 'neutral'} hint="Aguardam decisão comercial" />
        <StatCard label="Adjudicados" value={by(['awarded'])} icon={<FileCheck2 className="h-5 w-5" />} tone="ok" />
        <StatCard label="Rascunhos" value={by(['draft'])} icon={<FileClock className="h-5 w-5" />} hint="Ainda não publicados" />
      </div>
      {stamp(now)}
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><ActivityLine title="Actividade dos últimos 30 dias" dates={mine.map((o) => o.published_at)} label="Pedidos publicados" /><RecentOpps opps={mine} /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <BarsCard title="Pedidos por estado" data={data} />
        <div className="space-y-5">
          <div className="card card-pad">
            <h3 className="section-title !text-base mb-3">Prazos nos próximos 7 dias</h3>
            {closing.length === 0 ? <p className="text-ink-soft">Nenhum pedido a terminar.</p> : <ul className="divide-y divide-line">{closing.slice(0, 5).map((o) => <li key={o.id} className="flex items-center justify-between gap-3 py-2.5"><Link to={`/app/pedidos/${o.id}`} className="kbd-link truncate">{o.title}</Link><span className="shrink-0 text-sm text-ink-soft">{timeLeft(new Date(o.deadline), now)}</span></li>)}</ul>}
          </div>
          {d && (
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Taxa de resposta" value={formatPercent(responseRate(d).value)} hint={`${responseRate(d).numerator} de ${responseRate(d).denominator} pedidos elegíveis`} />
              <StatCard label="Taxa de conversão" value={formatPercent(conversionRate(d).value)} hint={`${conversionRate(d).numerator} de ${conversionRate(d).denominator} encerrados`} />
            </div>
          )}
          <p className="text-xs text-ink-mute">Definições: {DEFINITIONS.taxaResposta} {DEFINITIONS.taxaConversao}</p>
        </div>
      </div>
    </section>
  )
}

function AdminDashboard() {
  const rd = useReportData()
  if (rd.isLoading) return <Spinner />
  if (rd.isError || !rd.data) return <ErrorState error={rd.error} retry={() => rd.refetch()} />
  const d = rd.data
  const pc = profileCompletionRate(d), dc = documentComplianceRate(d), rr = responseRate(d), cr = conversionRate(d)
  const docC = countByEffectiveDocStatus(d)
  const queue = d.documents.filter((x) => ['submitted', 'under_review'].includes(x.status)).length
  const profQueue = d.organizations.filter((o) => ['submitted', 'under_review'].includes(o.profile_status)).length
  const profData = Object.entries(PROFILE_STATUS).map(([k, l]) => ({ name: l.text, value: d.organizations.filter((o) => o.profile_status === k).length })).filter((x) => x.value > 0)
  const oppData = Object.entries(OPP_STATUS).map(([k, l]) => ({ name: l.text, value: d.opportunities.filter((o) => o.status === k).length })).filter((x) => x.value > 0)
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão global da plataforma. Indicadores calculados com as definições formais documentadas nos relatórios; valores comerciais não são visíveis ao superadministrador." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Fornecedores activos" value={activeSuppliers(d).length} icon={<Building2 className="h-5 w-5" />} tone="ok" hint="Perfil aprovado e organização activa" />
        <StatCard label="Perfis por analisar" value={profQueue} icon={<ShieldCheck className="h-5 w-5" />} tone={profQueue ? 'warn' : 'neutral'} hint={<Link to="/app/admin/organizacoes" className="kbd-link">Abrir fila</Link>} />
        <StatCard label="Documentos por analisar" value={queue} icon={<FileClock className="h-5 w-5" />} tone={queue ? 'warn' : 'neutral'} hint={<Link to="/app/admin/documentos" className="kbd-link">Abrir fila</Link>} />
        <StatCard label="Documentos expirados" value={docC.expired} icon={<AlertTriangle className="h-5 w-5" />} tone={docC.expired ? 'danger' : 'neutral'} hint={`${docC.expiring} próximos da validade`} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Perfis completos" value={formatPercent(pc.value)} hint={`${pc.numerator} de ${pc.denominator} elegíveis`} />
        <StatCard label="Conformidade documental" value={formatPercent(dc.value)} hint={`${dc.numerator} de ${dc.denominator} requisitos aplicáveis`} />
        <StatCard label="Taxa de resposta" value={formatPercent(rr.value)} hint={`${rr.numerator} de ${rr.denominator} pedidos elegíveis`} />
        <StatCard label="Taxa de conversão" value={formatPercent(cr.value)} hint={`${cr.numerator} de ${cr.denominator} pedidos encerrados`} />
      </div>
      {stamp(d.now)}
      <div className="mt-6"><ActivityLine title="Actividade dos últimos 30 dias" dates={[...d.organizations.map((o) => o.created_at), ...d.documents.map((x) => x.submitted_at)]} label="Registos e documentos" /></div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2"><BarsCard title="Organizações por estado do perfil" data={profData} /><BarsCard title="Pedidos por estado" data={oppData} /></div>
      <p className="mt-4 text-xs text-ink-mute">Como são calculados: {DEFINITIONS.taxaPerfisCompletos} {DEFINITIONS.taxaConformidade} {DEFINITIONS.taxaResposta} {DEFINITIONS.taxaConversao}</p>
    </>
  )
}
export { AdminDashboard }

import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Building2, Globe, Mail, MapPin, Phone, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Button, DescriptionList, EmptyState, ErrorState, Field, Input, Pagination, Select, Spinner, StatusBadge } from '@/components/ui'
import { useCategories, useDocTypes } from '@/hooks/useCatalog'
import { PROFILE_STATUS, PROVINCES, VERIFICATION_STATUS } from '@/lib/domain/labels'
import { formatDate } from '@/lib/domain/format'
import type { DirectoryEntry } from '@/lib/domain/types'
import { getDirectoryEntry, getEntryServices, searchDirectory } from '@/services/organizations'

const name = (o: Pick<DirectoryEntry, 'legal_name' | 'trade_name'>) => o.trade_name || o.legal_name

export function VerificationBadge({ o }: { o: Pick<DirectoryEntry, 'verification_status' | 'verification_scope'> }) {
  const l = VERIFICATION_STATUS[o.verification_status]
  if (o.verification_status === 'verified') return <Badge tone="ok">Verificado: {o.verification_scope}</Badge>
  return <Badge tone={l.tone}>{l.text}</Badge>
}

export function SupplierCard({ o, to, categories }: { o: DirectoryEntry; to: string; categories: Map<string, string> }) {
  return (
    <article className="card flex flex-col p-5 transition-shadow hover:shadow-pop">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-navy font-display text-lg font-bold text-white" aria-hidden>{name(o).slice(0, 1)}</span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-snug"><Link to={to} className="!text-navy hover:underline">{name(o)}</Link></h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft"><MapPin className="h-3.5 w-3.5" aria-hidden />{[o.municipality, o.province].filter(Boolean).join(', ') || 'Localização não indicada'}</p>
        </div>
      </div>
      {o.description && <p className="mt-3 line-clamp-3 text-[15px] text-ink-soft">{o.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {o.category_ids.slice(0, 3).map((id) => <span key={id} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">{categories.get(id) ?? '—'}</span>)}
        {o.category_ids.length > 3 && <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-ink-soft">+{o.category_ids.length - 3}</span>}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <VerificationBadge o={o} />
        <Link to={to} className="kbd-link text-sm">Ver perfil →</Link>
      </div>
    </article>
  )
}

/** Pesquisa de fornecedores — usada na área pública e na área autenticada. */
export function SupplierSearch({ basePath, showDocFilter }: { basePath: string; showDocFilter?: boolean }) {
  const [f, setF] = useState({ q: '', province: '', categoryId: '', verifiedOnly: false, docTypeId: '' })
  const [applied, setApplied] = useState(f)
  const [page, setPage] = useState(0)
  const cats = useCategories()
  const docTypes = useDocTypes()
  const catMap = new Map((cats.data ?? []).map((c) => [c.id, c.name]))
  const res = useQuery({ queryKey: ['directory', applied, page], queryFn: () => searchDirectory({ ...applied, page, pageSize: 9 }) })
  const submit = (e: React.FormEvent) => { e.preventDefault(); setPage(0); setApplied(f) }
  return (
    <div>
      <form onSubmit={submit} className="card card-pad mb-6" role="search" aria-label="Pesquisa de fornecedores">
        <div className="grid gap-3 md:grid-cols-12">
          <Field label="Nome, serviço ou especialidade" className="md:col-span-5">{(id) => <Input id={id} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Ex.: manutenção de bombas" />}</Field>
          <Field label="Categoria" className="md:col-span-3">{(id) => <Select id={id} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">Todas</option>{(cats.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
          <Field label="Província" className="md:col-span-2">{(id) => <Select id={id} value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}><option value="">Todas</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select>}</Field>
          <div className="flex items-end md:col-span-2"><Button type="submit" className="w-full"><Search className="h-4 w-4" aria-hidden />Pesquisar</Button></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-[18px] w-[18px] accent-brand-700" checked={f.verifiedOnly} onChange={(e) => setF({ ...f, verifiedOnly: e.target.checked })} />Só com verificação registada</label>
          {showDocFilter && (
            <label className="flex items-center gap-2 text-[15px]">Com documento válido:
              <Select className="!min-h-[34px] w-56" aria-label="Tipo de documento válido" value={f.docTypeId} onChange={(e) => setF({ ...f, docTypeId: e.target.value })}><option value="">Qualquer</option>{(docTypes.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            </label>
          )}
        </div>
      </form>
      {res.isLoading ? <Spinner /> : res.isError ? <ErrorState error={res.error} retry={() => res.refetch()} /> : !res.data?.rows.length ? (
        <div className="card"><EmptyState icon={<Building2 />} title="Nenhum fornecedor encontrado">Experimente remover filtros ou usar outros termos. Só aparecem fornecedores com perfil aprovado que autorizaram a sua visibilidade.</EmptyState></div>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-soft" aria-live="polite">{res.data.count} fornecedor(es) encontrado(s)</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{res.data.rows.map((o) => <SupplierCard key={o.id} o={o} to={`${basePath}/${o.id}`} categories={catMap} />)}</div>
          {res.data.count > 9 && <div className="card mt-5"><Pagination page={page} pages={Math.ceil(res.data.count / 9)} total={res.data.count} onChange={setPage} /></div>}
        </>
      )}
    </div>
  )
}

export function SupplierProfile({ id, backTo, isPublic }: { id: string; backTo: string; isPublic?: boolean }) {
  const q = useQuery({ queryKey: ['directory-entry', id], queryFn: () => getDirectoryEntry(id) })
  const sv = useQuery({ queryKey: ['entry-services', id], queryFn: () => getEntryServices(id) })
  const cats = useCategories()
  const docTypes = useDocTypes()
  const catMap = new Map((cats.data ?? []).map((c) => [c.id, c.name]))
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const o = q.data
  if (!o) return <div className="card"><EmptyState title="Perfil não disponível">Este fornecedor não existe ou não autorizou a sua visibilidade.</EmptyState><div className="pb-8 text-center"><Link className="kbd-link" to={backTo}>← Voltar à pesquisa</Link></div></div>
  const contact = [
    o.phone && { icon: <Phone className="h-4 w-4" />, t: o.phone }, o.email && { icon: <Mail className="h-4 w-4" />, t: o.email },
    o.website && { icon: <Globe className="h-4 w-4" />, t: o.website }, o.address && { icon: <MapPin className="h-4 w-4" />, t: o.address },
  ].filter(Boolean) as { icon: React.ReactNode; t: string }[]
  return (
    <div>
      <p className="mb-3 text-sm"><Link to={backTo} className="kbd-link">← Voltar à pesquisa</Link></p>
      <div className="card overflow-hidden">
        <div className="bg-navy px-6 py-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="!text-white text-[26px] font-bold">{name(o)}</h1>
              {o.trade_name && <p className="text-white/70">{o.legal_name}</p>}
              <p className="mt-1 flex items-center gap-1 text-white/80"><MapPin className="h-4 w-4" aria-hidden />{[o.municipality, o.province].filter(Boolean).join(', ')}</p>
            </div>
            <div className="flex flex-wrap gap-2"><VerificationBadge o={o} />{!isPublic && o.profile_status !== 'approved' && <StatusBadge label={PROFILE_STATUS[o.profile_status]} />}</div>
          </div>
        </div>
        <div className="grid gap-8 p-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section><h2 className="section-title mb-2">Sobre a empresa</h2><p className="text-[15px] text-ink">{o.description || 'Sem descrição.'}</p></section>
            {o.capabilities && <section><h2 className="section-title mb-2">Capacidades técnicas declaradas</h2><p className="text-[15px] text-ink">{o.capabilities}</p><p className="hint">Declarações da própria empresa; não implicam verificação.</p></section>}
            <section>
              <h2 className="section-title mb-2">Serviços e especialidades</h2>
              {sv.isLoading ? <Spinner /> : !sv.data?.length ? <p className="text-ink-soft">Sem serviços registados.</p> : (
                <ul className="space-y-3">{sv.data.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line p-3">
                    <p className="font-semibold text-navy">{s.name} <span className="ml-1 text-sm font-normal text-ink-mute">· {catMap.get(s.category_id)}</span></p>
                    {s.description && <p className="mt-0.5 text-sm text-ink-soft">{s.description}</p>}
                    {s.specialties.length > 0 && <p className="mt-1.5 flex flex-wrap gap-1.5">{s.specialties.map((x) => <span key={x} className="rounded bg-surface px-2 py-0.5 text-xs font-semibold text-ink-soft">{x}</span>)}</p>}
                  </li>))}</ul>
              )}
            </section>
          </div>
          <aside className="space-y-5">
            <section className="rounded-card bg-surface p-4">
              <h2 className="section-title mb-2 !text-base">Contacto</h2>
              {contact.length ? <ul className="space-y-2 text-[15px]">{contact.map((c, i) => <li key={i} className="flex items-start gap-2"><span className="mt-0.5 text-brand-700" aria-hidden>{c.icon}</span><span className="break-words">{c.t}</span></li>)}{o.contact_person && <li className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 text-brand-700" aria-hidden />{o.contact_person}</li>}</ul>
                : <p className="text-sm text-ink-soft">A empresa não disponibilizou contactos neste perfil.</p>}
            </section>
            <DescriptionList cols={1} items={[
              { label: 'Sector', value: o.sector }, { label: 'Fundada em', value: o.founded_year }, { label: 'Trabalhadores', value: o.employee_count },
              { label: 'NIF', value: o.nif }, { label: 'Perfil actualizado', value: formatDate(o.profile_updated_at) },
            ]} />
            {o.certifications_declared.length > 0 && <div><p className="text-xs font-bold uppercase tracking-wide text-ink-mute">Certificações declaradas</p><p className="mt-1 flex flex-wrap gap-1.5">{o.certifications_declared.map((c) => <Badge key={c}>{c}</Badge>)}</p></div>}
            {o.valid_doc_type_ids.length > 0 && (
              <div><p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink-mute"><BadgeCheck className="h-3.5 w-3.5" aria-hidden />Documentos válidos (aprovados)</p>
                <ul className="mt-1 space-y-1 text-sm">{o.valid_doc_type_ids.map((d) => <li key={d}>{docTypes.data?.find((t) => t.id === d)?.name ?? '—'}</li>)}</ul></div>
            )}
          </aside>
        </div>
      </div>
      {isPublic && <div className="mt-4"><Alert tone="info">Para contactar esta empresa ou convidá-la para um pedido de cotação, <Link to="/entrar" className="kbd-link">inicie sessão</Link> com uma conta de empresa compradora.</Alert></div>}
    </div>
  )
}

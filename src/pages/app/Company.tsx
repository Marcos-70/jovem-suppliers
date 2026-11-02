import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Alert, Badge, Button, ConfirmDialog, DescriptionList, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, TabPanel, Tabs, Textarea, useToast } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useCategories, useSettings } from '@/hooks/useCatalog'
import { friendlyError } from '@/lib/domain/errors'
import { formatDate, formatDateTime } from '@/lib/domain/format'
import { OPTIONAL_PUBLIC_FIELDS, ORG_TYPE_LABEL, PROFILE_STATUS, PROVINCES, VERIFICATION_STATUS, VISIBILITY_LABEL } from '@/lib/domain/labels'
import { P } from '@/lib/domain/permissions'
import { FIELD_LABEL, missingProfileFields } from '@/lib/domain/profile'
import type { Organization, OrgVisibility, Service } from '@/lib/domain/types'
import { organizationSchema, serviceSchema } from '@/lib/domain/validators'
import { deleteService, getOrganization, listServices, saveService, submitProfile, updateOrganization } from '@/services/organizations'

type Tab = 'perfil' | 'servicos' | 'visibilidade' | 'estado'
type OrgForm = z.input<typeof organizationSchema>

export default function Company() {
  const a = useAuth()
  const orgId = a.activeMembership!.organization_id
  const [tab, setTab] = useState<Tab>('perfil')
  const org = useQuery({ queryKey: ['org', orgId], queryFn: () => getOrganization(orgId) })
  const services = useQuery({ queryKey: ['services', orgId], queryFn: () => listServices(orgId) })
  const settings = useSettings()
  if (org.isLoading) return <Spinner />
  if (org.isError || !org.data) return <ErrorState error={org.error} retry={() => org.refetch()} />
  const o = org.data
  const miss = missingProfileFields(o, services.data?.length ?? 0, settings.data?.profile_required_fields as string[] | undefined)
  return (
    <>
      <PageHeader title="A minha empresa" subtitle="Perfil empresarial, serviços e o que mostra a outras organizações." actions={<StatusBadge label={PROFILE_STATUS[o.profile_status]} />} />
      <Tabs label="Secções da empresa" value={tab} onChange={setTab} tabs={[{ id: 'perfil', label: 'Perfil' }, { id: 'servicos', label: 'Serviços', count: services.data?.length }, { id: 'visibilidade', label: 'Visibilidade' }, { id: 'estado', label: 'Estado e verificação' }]} />
      <TabPanel id="perfil" active={tab === 'perfil'}><ProfileForm org={o} readOnly={!a.can(P.orgEdit)} /></TabPanel>
      <TabPanel id="servicos" active={tab === 'servicos'}><Services orgId={orgId} canEdit={a.can(P.servicesManage)} /></TabPanel>
      <TabPanel id="visibilidade" active={tab === 'visibilidade'}><Visibility org={o} readOnly={!a.can(P.orgEdit)} /></TabPanel>
      <TabPanel id="estado" active={tab === 'estado'}><Status org={o} missing={miss} canSubmit={a.can(P.orgEdit)} /></TabPanel>
    </>
  )
}

function ProfileForm({ org, readOnly }: { org: Organization; readOnly: boolean }) {
  const qc = useQueryClient(), toast = useToast(), a = useAuth()
  const f = useForm<OrgForm>({ resolver: zodResolver(organizationSchema), defaultValues: toForm(org) })
  useEffect(() => f.reset(toForm(org)), [org, f])
  const e = f.formState.errors
  const nifLocked = org.verification_status !== 'not_verified'
  const m = useMutation({
    mutationFn: (v: OrgForm) => updateOrganization(org.id, fromForm(v as z.output<typeof organizationSchema>)),
    onSuccess: () => { toast.success('Perfil guardado.'); qc.invalidateQueries({ queryKey: ['org', org.id] }); a.refresh() },
    onError: (err) => toast.error(friendlyError(err)),
  })
  return (
    <form onSubmit={f.handleSubmit((v) => m.mutate(v))} noValidate className="card card-pad">
      {readOnly && <div className="mb-4"><Alert tone="info">A sua função permite consultar mas não editar o perfil.</Alert></div>}
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome legal" error={e.legal_name?.message} required>{(id, d) => <Input id={id} aria-describedby={d} {...f.register('legal_name')} />}</Field>
        <Field label="Nome comercial">{(id) => <Input id={id} {...f.register('trade_name')} />}</Field>
        <Field label="NIF" error={e.nif?.message} hint={nifLocked ? 'Bloqueado após verificação.' : undefined} required>{(id, d) => <Input id={id} disabled={nifLocked} aria-describedby={d} {...f.register('nif')} />}</Field>
        <Field label="Registo comercial">{(id) => <Input id={id} {...f.register('commercial_registry')} />}</Field>
        <Field label="Tipo de organização">{(id) => <Select id={id} {...f.register('org_type')}>{Object.entries(ORG_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
        <Field label="Sector de actividade">{(id) => <Input id={id} {...f.register('sector')} />}</Field>
        <Field label="Província">{(id) => <Select id={id} {...f.register('province')}><option value="">Seleccione…</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select>}</Field>
        <Field label="Município">{(id) => <Input id={id} {...f.register('municipality')} />}</Field>
        <Field label="Morada comercial" className="sm:col-span-2">{(id) => <Input id={id} {...f.register('address')} />}</Field>
        <Field label="Telefone">{(id) => <Input id={id} type="tel" {...f.register('phone')} />}</Field>
        <Field label="E-mail profissional" error={e.email?.message}>{(id, d) => <Input id={id} type="email" aria-describedby={d} {...f.register('email')} />}</Field>
        <Field label="Website" error={e.website?.message}>{(id, d) => <Input id={id} placeholder="https://" aria-describedby={d} {...f.register('website')} />}</Field>
        <Field label="Pessoa de contacto">{(id) => <Input id={id} {...f.register('contact_person')} />}</Field>
        <Field label="Ano de fundação" error={e.founded_year?.message as string}>{(id, d) => <Input id={id} type="number" aria-describedby={d} {...f.register('founded_year')} />}</Field>
        <Field label="Número de trabalhadores" error={e.employee_count?.message as string}>{(id, d) => <Input id={id} type="number" aria-describedby={d} {...f.register('employee_count')} />}</Field>
        <Field label="Descrição da empresa" className="sm:col-span-2" hint="Apresente a actividade, experiência e clientes-tipo.">{(id) => <Textarea id={id} rows={4} {...f.register('description')} />}</Field>
        <Field label="Capacidades técnicas declaradas" className="sm:col-span-2" hint="Declarações da empresa; não são verificadas automaticamente.">{(id) => <Textarea id={id} rows={3} {...f.register('capabilities')} />}</Field>
        <Field label="Certificações declaradas" className="sm:col-span-2" hint="Separe por vírgulas. Para valer como prova, carregue o certificado em Documentos.">{(id) => <Input id={id} {...f.register('certifications_declared')} />}</Field>
      </fieldset>
      {!readOnly && <div className="mt-5 flex justify-end"><Button type="submit" loading={m.isPending}>Guardar alterações</Button></div>}
    </form>
  )
}
const toForm = (o: Organization): OrgForm => ({
  legal_name: o.legal_name, trade_name: o.trade_name ?? '', nif: o.nif ?? '', commercial_registry: o.commercial_registry ?? '', org_type: o.org_type, sector: o.sector ?? '', province: o.province ?? '',
  municipality: o.municipality ?? '', address: o.address ?? '', phone: o.phone ?? '', email: o.email ?? '', website: o.website ?? '', contact_person: o.contact_person ?? '', description: o.description ?? '',
  founded_year: (o.founded_year ?? '') as never, employee_count: (o.employee_count ?? '') as never, capabilities: o.capabilities ?? '', certifications_declared: (o.certifications_declared ?? []).join(', '),
})
const fromForm = (v: z.output<typeof organizationSchema>): Partial<Organization> => {
  const n = (x: unknown) => (x === '' || x === undefined || x === null ? null : Number(x))
  const s = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null)
  const cert = v.certifications_declared
  return {
    legal_name: v.legal_name, trade_name: s(v.trade_name), nif: v.nif, commercial_registry: s(v.commercial_registry), org_type: v.org_type, sector: s(v.sector), province: s(v.province), municipality: s(v.municipality),
    address: s(v.address), phone: s(v.phone), email: s(v.email), website: s(v.website), contact_person: s(v.contact_person), description: s(v.description), founded_year: n(v.founded_year), employee_count: n(v.employee_count),
    capabilities: s(v.capabilities), certifications_declared: typeof cert === 'string' ? cert.split(',').map((x) => x.trim()).filter(Boolean) : [],
  }
}

function Services({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const qc = useQueryClient(), toast = useToast()
  const cats = useCategories()
  const list = useQuery({ queryKey: ['services', orgId], queryFn: () => listServices(orgId) })
  const [edit, setEdit] = useState<Partial<Service> | null>(null)
  const [del, setDel] = useState<Service | null>(null)
  const f = useForm<z.input<typeof serviceSchema>>({ resolver: zodResolver(serviceSchema) })
  useEffect(() => { if (edit) f.reset({ name: edit.name ?? '', category_id: edit.category_id ?? '', description: edit.description ?? '', specialties: (edit.specialties ?? []).join(', '), areas: (edit.areas ?? []).join(', ') }) }, [edit, f])
  const save = useMutation({
    mutationFn: (v: z.input<typeof serviceSchema>) => saveService(orgId, { id: edit?.id, name: v.name, category_id: v.category_id, description: v.description || null, specialties: split(v.specialties), areas: split(v.areas) }),
    onSuccess: () => { toast.success('Serviço guardado.'); setEdit(null); qc.invalidateQueries({ queryKey: ['services', orgId] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const rm = useMutation({ mutationFn: (id: string) => deleteService(id), onSuccess: () => { toast.success('Serviço removido.'); setDel(null); qc.invalidateQueries({ queryKey: ['services', orgId] }) }, onError: (e) => toast.error(friendlyError(e)) })
  const catName = (id: string) => cats.data?.find((c) => c.id === id)?.name ?? '—'
  return (
    <div>
      <div className="mb-4 flex justify-between gap-3"><p className="max-w-xl text-ink-soft">Os serviços e especialidades são o que os compradores pesquisam. Seja específico.</p>{canEdit && <Button onClick={() => setEdit({})}><Plus className="h-4 w-4" aria-hidden />Novo serviço</Button>}</div>
      {list.isLoading ? <Spinner /> : !list.data?.length ? <div className="card"><EmptyState title="Ainda não registou serviços" action={canEdit ? <Button onClick={() => setEdit({})}>Adicionar o primeiro serviço</Button> : undefined}>Um perfil só fica completo com pelo menos um serviço.</EmptyState></div> : (
        <ul className="grid gap-3 md:grid-cols-2">{list.data.map((s) => (
          <li key={s.id} className="card p-4">
            <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-navy">{s.name}</p><p className="text-sm text-ink-mute">{catName(s.category_id)}</p></div>
              {canEdit && <div className="flex gap-1"><button aria-label={`Editar ${s.name}`} className="rounded p-1.5 text-ink-soft hover:bg-surface" onClick={() => setEdit(s)}><Pencil className="h-4 w-4" /></button><button aria-label={`Remover ${s.name}`} className="rounded p-1.5 text-danger hover:bg-surface" onClick={() => setDel(s)}><Trash2 className="h-4 w-4" /></button></div>}</div>
            {s.description && <p className="mt-2 text-[15px] text-ink-soft">{s.description}</p>}
            <p className="mt-2 flex flex-wrap gap-1.5">{s.specialties.map((x) => <Badge key={x}>{x}</Badge>)}</p>
          </li>))}</ul>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar serviço' : 'Novo serviço'} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button loading={save.isPending} onClick={f.handleSubmit((v) => save.mutate(v))}>Guardar</Button></>}>
        <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
          <Field label="Serviço" error={f.formState.errors.name?.message} required>{(id, d) => <Input id={id} aria-describedby={d} {...f.register('name')} />}</Field>
          <Field label="Categoria" error={f.formState.errors.category_id?.message} required>{(id, d) => <Select id={id} aria-describedby={d} {...f.register('category_id')}><option value="">Seleccione…</option>{cats.data?.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
          <Field label="Descrição">{(id) => <Textarea id={id} {...f.register('description')} />}</Field>
          <Field label="Especialidades" hint="Separe por vírgulas.">{(id) => <Input id={id} {...f.register('specialties')} />}</Field>
          <Field label="Áreas de actuação" hint="Províncias ou locais, separados por vírgulas.">{(id) => <Input id={id} {...f.register('areas')} />}</Field>
        </form>
      </Modal>
      <ConfirmDialog open={!!del} danger title="Remover serviço" message={`Remover «${del?.name}»? Esta acção não afecta propostas já submetidas.`} confirmLabel="Remover" loading={rm.isPending} onConfirm={() => del && rm.mutate(del.id)} onClose={() => setDel(null)} />
    </div>
  )
}
const split = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)

function Visibility({ org, readOnly }: { org: Organization; readOnly: boolean }) {
  const qc = useQueryClient(), toast = useToast()
  const [vis, setVis] = useState<OrgVisibility>(org.visibility)
  const [fields, setFields] = useState<string[]>(org.public_fields ?? [])
  const m = useMutation({ mutationFn: () => updateOrganization(org.id, { visibility: vis, public_fields: vis === 'private' ? [] : fields }), onSuccess: () => { toast.success('Preferências de visibilidade guardadas.'); qc.invalidateQueries({ queryKey: ['org', org.id] }) }, onError: (e) => toast.error(friendlyError(e)) })
  return (
    <div className="card card-pad max-w-3xl">
      <h2 className="section-title">Quem pode ver o perfil da empresa</h2>
      <p className="mb-4 mt-1 text-ink-soft">Por omissão, o perfil é privado. O nome, a localização, a descrição e os serviços só aparecem a outros se escolher uma das opções abaixo <strong>e</strong> o perfil estiver aprovado.</p>
      <fieldset disabled={readOnly} className="space-y-2">
        <legend className="sr-only">Visibilidade</legend>
        {(Object.keys(VISIBILITY_LABEL) as OrgVisibility[]).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-50"><input type="radio" name="vis" className="h-4 w-4 accent-brand-700" checked={vis === k} onChange={() => setVis(k)} /><span className="font-semibold text-navy">{VISIBILITY_LABEL[k]}</span></label>
        ))}
        {vis !== 'private' && (
          <div className="mt-4"><p className="label">Informação opcional a mostrar</p><div className="grid gap-2 sm:grid-cols-2">{OPTIONAL_PUBLIC_FIELDS.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-[15px]"><input type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-brand-700" checked={fields.includes(f.key)} onChange={(e) => setFields(e.target.checked ? [...fields, f.key] : fields.filter((x) => x !== f.key))} />{f.label}</label>))}</div></div>
        )}
      </fieldset>
      {org.visibility_consent_at && <p className="mt-4 text-sm text-ink-mute">Consentimento registado em {formatDateTime(org.visibility_consent_at)}.</p>}
      {org.profile_status !== 'approved' && vis !== 'private' && <div className="mt-4"><Alert tone="warn">O perfil ainda não está aprovado, por isso não será listado até à aprovação.</Alert></div>}
      {!readOnly && <div className="mt-5 flex justify-end"><Button loading={m.isPending} onClick={() => m.mutate()}>Guardar e dar consentimento</Button></div>}
    </div>
  )
}

function Status({ org, missing, canSubmit }: { org: Organization; missing: string[]; canSubmit: boolean }) {
  const qc = useQueryClient(), toast = useToast(), a = useAuth()
  const m = useMutation({ mutationFn: () => submitProfile(org.id), onSuccess: () => { toast.success('Perfil submetido para análise.'); qc.invalidateQueries({ queryKey: ['org', org.id] }); a.refresh() }, onError: (e) => toast.error(friendlyError(e)) })
  const canSend = ['draft', 'incomplete', 'corrections_pending'].includes(org.profile_status)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card card-pad">
        <h2 className="section-title mb-3">Estado do perfil</h2>
        <DescriptionList cols={1} items={[{ label: 'Estado', value: <StatusBadge label={PROFILE_STATUS[org.profile_status]} /> }, { label: 'Submetido em', value: formatDateTime(org.submitted_at) }, { label: 'Última actualização', value: formatDate(org.profile_updated_at) }]} />
        {org.profile_review_reason && <div className="mt-4"><Alert tone="warn" title="Indicação da JOVEM+">{org.profile_review_reason}</Alert></div>}
        <div className="mt-5">
          {missing.length > 0 ? <Alert tone="warn" title={`Faltam ${missing.length} campo(s) obrigatório(s)`}><ul className="mt-1 list-disc pl-5">{missing.map((f) => <li key={f}>{FIELD_LABEL[f] ?? f}</li>)}</ul></Alert> : <Alert tone="ok" title="Todos os campos obrigatórios estão preenchidos" />}
        </div>
        {canSubmit && canSend && <div className="mt-4"><Button onClick={() => m.mutate()} disabled={missing.length > 0} loading={m.isPending}>Submeter para análise</Button></div>}
      </div>
      <div className="card card-pad">
        <h2 className="section-title mb-3">Verificação</h2>
        <p className="mb-3"><Badge tone={VERIFICATION_STATUS[org.verification_status].tone}>{VERIFICATION_STATUS[org.verification_status].text}</Badge></p>
        {org.verification_status === 'verified' ? <DescriptionList cols={1} items={[{ label: 'Âmbito verificado', value: org.verification_scope }, { label: 'Data', value: formatDate(org.verified_at) }]} /> : <p className="text-ink-soft">Ainda sem verificação. A JOVEM+ verifica apenas o que consegue confirmar através de documentos aprovados e indica sempre o âmbito (por exemplo, «registo comercial e NIF»).</p>}
      </div>
    </div>
  )
}

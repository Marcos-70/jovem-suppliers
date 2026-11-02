import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Alert, Badge, Button, Checkbox, DataTable, Field, Input, Modal, PageHeader, Select, Spinner, TabPanel, Tabs, useToast, type Column } from '@/components/ui'
import { useCategories, useDocTypes, useRequirements, useSettings } from '@/hooks/useCatalog'
import { friendlyError } from '@/lib/domain/errors'
import { FIELD_LABEL } from '@/lib/domain/profile'
import type { Category, DocumentType, QualificationRequirement } from '@/lib/domain/types'
import { runAlertJobs } from '@/services/audit'
import { saveCategory, saveDocumentType, saveRequirement, saveSetting } from '@/services/catalog'

type Tab = 'cat' | 'tipos' | 'req' | 'def' | 'tarefas'
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function AdminConfig() {
  const [tab, setTab] = useState<Tab>('cat')
  return (
    <>
      <PageHeader title="Configurações" subtitle="Categorias, tipos documentais, requisitos de qualificação e regras. As alterações ficam em auditoria." />
      <Tabs label="Configurações" value={tab} onChange={setTab} tabs={[{ id: 'cat', label: 'Categorias' }, { id: 'tipos', label: 'Tipos documentais' }, { id: 'req', label: 'Requisitos' }, { id: 'def', label: 'Regras e definições' }, { id: 'tarefas', label: 'Tarefas' }]} />
      <TabPanel id="cat" active={tab === 'cat'}><Categories /></TabPanel><TabPanel id="tipos" active={tab === 'tipos'}><DocTypes /></TabPanel>
      <TabPanel id="req" active={tab === 'req'}><Requirements /></TabPanel><TabPanel id="def" active={tab === 'def'}><Rules /></TabPanel><TabPanel id="tarefas" active={tab === 'tarefas'}><Jobs /></TabPanel>
    </>
  )
}

function useSave<V>(fn: (v: V) => Promise<unknown>, key: string, done: () => void) {
  const qc = useQueryClient(), toast = useToast()
  return useMutation({ mutationFn: fn, onSuccess: () => { toast.success('Guardado.'); qc.invalidateQueries({ queryKey: [key] }); done() }, onError: (e) => toast.error(friendlyError(e)) })
}

function Categories() {
  const q = useCategories(); const [e, setE] = useState<Partial<Category> | null>(null)
  const m = useSave((c: Partial<Category> & { name: string; slug: string }) => saveCategory(c), 'categories', () => setE(null))
  const cols: Column<Category>[] = [{ key: 'n', header: 'Categoria', cell: (c) => c.name }, { key: 'o', header: 'Ordem', align: 'right', cell: (c) => c.sort_order }, { key: 's', header: 'Estado', cell: (c) => (c.is_active ? <Badge tone="ok">Activa</Badge> : <Badge>Inactiva</Badge>) }, { key: 'a', header: '', cell: (c) => <div className="flex gap-1.5"><Button variant="secondary" small onClick={() => setE(c)}>Editar</Button><Button variant="ghost" small onClick={() => m.mutate({ ...c, is_active: !c.is_active })}>{c.is_active ? 'Desactivar' : 'Activar'}</Button></div> }]
  if (q.isLoading) return <Spinner />
  return (<div><div className="mb-3 flex justify-end"><Button onClick={() => setE({ is_active: true, sort_order: (q.data?.length ?? 0) + 1 })}><Plus className="h-4 w-4" aria-hidden />Nova categoria</Button></div>
    <DataTable rows={q.data ?? []} columns={cols} rowKey={(c) => c.id} caption="Categorias" pageSize={20} />
    <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? 'Editar categoria' : 'Nova categoria'} footer={<><Button variant="secondary" onClick={() => setE(null)}>Cancelar</Button><Button loading={m.isPending} disabled={!e?.name?.trim()} onClick={() => m.mutate({ ...e, name: e!.name!.trim(), slug: e?.slug || slug(e!.name!) })}>Guardar</Button></>}>
      <div className="space-y-3"><Field label="Nome" required>{(i) => <Input id={i} value={e?.name ?? ''} onChange={(x) => setE({ ...e, name: x.target.value })} />}</Field><Field label="Ordem">{(i) => <Input id={i} type="number" value={e?.sort_order ?? 0} onChange={(x) => setE({ ...e, sort_order: Number(x.target.value) })} />}</Field></div></Modal></div>)
}

function DocTypes() {
  const q = useDocTypes(); const [e, setE] = useState<Partial<DocumentType> | null>(null)
  const m = useSave((t: Partial<DocumentType> & { name: string; code: string }) => saveDocumentType(t), 'docTypes', () => setE(null))
  const cols: Column<DocumentType>[] = [{ key: 'n', header: 'Tipo', cell: (t) => t.name }, { key: 'v', header: 'Exige validade', cell: (t) => (t.requires_expiry ? 'Sim' : 'Não') }, { key: 'm', header: 'Máx.', align: 'right', cell: (t) => `${t.max_size_mb} MB` }, { key: 's', header: 'Estado', cell: (t) => (t.is_active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>) }, { key: 'a', header: '', cell: (t) => <div className="flex gap-1.5"><Button variant="secondary" small onClick={() => setE(t)}>Editar</Button><Button variant="ghost" small onClick={() => m.mutate({ ...t, is_active: !t.is_active })}>{t.is_active ? 'Desactivar' : 'Activar'}</Button></div> }]
  if (q.isLoading) return <Spinner />
  return (<div><div className="mb-3 flex justify-end"><Button onClick={() => setE({ requires_expiry: false, max_size_mb: 10, is_active: true })}><Plus className="h-4 w-4" aria-hidden />Novo tipo</Button></div>
    <DataTable rows={q.data ?? []} columns={cols} rowKey={(t) => t.id} caption="Tipos documentais" pageSize={20} />
    <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? 'Editar tipo' : 'Novo tipo documental'} footer={<><Button variant="secondary" onClick={() => setE(null)}>Cancelar</Button><Button loading={m.isPending} disabled={!e?.name?.trim()} onClick={() => m.mutate({ ...e, name: e!.name!.trim(), code: e?.code || slug(e!.name!).replace(/-/g, '_') })}>Guardar</Button></>}>
      <div className="space-y-3"><Field label="Nome" required>{(i) => <Input id={i} value={e?.name ?? ''} onChange={(x) => setE({ ...e, name: x.target.value })} />}</Field>
        <Checkbox label="Exige data de validade" hint="Só marque quando a validade é inerente ao documento." checked={!!e?.requires_expiry} onChange={(x) => setE({ ...e, requires_expiry: x.target.checked })} />
        <Field label="Tamanho máximo (MB)">{(i) => <Input id={i} type="number" min="1" max="50" value={e?.max_size_mb ?? 10} onChange={(x) => setE({ ...e, max_size_mb: Number(x.target.value) })} />}</Field></div></Modal></div>)
}

function Requirements() {
  const q = useRequirements(), types = useDocTypes(), cats = useCategories(); const [e, setE] = useState<Partial<QualificationRequirement> | null>(null)
  const m = useSave((r: Partial<QualificationRequirement> & { name: string; document_type_id: string }) => saveRequirement(r), 'requirements', () => setE(null))
  const cols: Column<QualificationRequirement>[] = [{ key: 'n', header: 'Requisito', cell: (r) => <div>{r.name}<p className="text-xs text-ink-mute">{types.data?.find((t) => t.id === r.document_type_id)?.name}</p></div> }, { key: 'c', header: 'Aplica-se a', cell: (r) => (r.category_id ? cats.data?.find((c) => c.id === r.category_id)?.name : 'Todos os fornecedores') }, { key: 'v', header: 'Validade mínima', align: 'right', cell: (r) => `${r.min_validity_days} dias` }, { key: 's', header: 'Estado', cell: (r) => (r.is_active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>) }, { key: 'a', header: '', cell: (r) => <div className="flex gap-1.5"><Button variant="secondary" small onClick={() => setE(r)}>Editar</Button><Button variant="ghost" small onClick={() => m.mutate({ ...r, is_active: !r.is_active })}>{r.is_active ? 'Desactivar' : 'Activar'}</Button></div> }]
  if (q.isLoading) return <Spinner />
  return (<div><div className="mb-3 flex justify-end"><Button onClick={() => setE({ is_mandatory: true, is_active: true, min_validity_days: 0 })}><Plus className="h-4 w-4" aria-hidden />Novo requisito</Button></div>
    <DataTable rows={q.data ?? []} columns={cols} rowKey={(r) => r.id} caption="Requisitos de qualificação" />
    <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? 'Editar requisito' : 'Novo requisito'} footer={<><Button variant="secondary" onClick={() => setE(null)}>Cancelar</Button><Button loading={m.isPending} disabled={!e?.name?.trim() || !e?.document_type_id} onClick={() => m.mutate({ ...e, name: e!.name!.trim(), document_type_id: e!.document_type_id!, category_id: e?.category_id || null })}>Guardar</Button></>}>
      <div className="space-y-3"><Field label="Nome" required>{(i) => <Input id={i} value={e?.name ?? ''} onChange={(x) => setE({ ...e, name: x.target.value })} />}</Field>
        <Field label="Documento exigido" required>{(i) => <Select id={i} value={e?.document_type_id ?? ''} onChange={(x) => setE({ ...e, document_type_id: x.target.value })}><option value="">Seleccione…</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}</Field>
        <Field label="Aplicar só à categoria" hint="Vazio = todos os fornecedores.">{(i) => <Select id={i} value={e?.category_id ?? ''} onChange={(x) => setE({ ...e, category_id: x.target.value || null })}><option value="">Todos</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
        <Field label="Validade mínima restante (dias)">{(i) => <Input id={i} type="number" min="0" value={e?.min_validity_days ?? 0} onChange={(x) => setE({ ...e, min_validity_days: Number(x.target.value) })} />}</Field></div></Modal></div>)
}

const ALL_FIELDS = ['legal_name', 'nif', 'sector', 'province', 'municipality', 'address', 'phone', 'email', 'website', 'contact_person', 'description', 'founded_year', 'employee_count', 'capabilities', 'services']
function Rules() {
  const q = useSettings(); const qc = useQueryClient(), toast = useToast()
  const [fields, setFields] = useState<string[] | null>(null), [alerts, setAlerts] = useState<string | null>(null)
  const cur = fields ?? (q.data?.profile_required_fields as string[] | undefined) ?? [], curAlerts = alerts ?? ((q.data?.document_alert_days as number[] | undefined) ?? [30, 15, 7]).join(', ')
  const m = useMutation({ mutationFn: async () => { await saveSetting('profile_required_fields', cur); const days = curAlerts.split(',').map((x) => Number(x.trim())).filter((x) => x > 0); if (days.length) await saveSetting('document_alert_days', days) }, onSuccess: () => { toast.success('Regras guardadas.'); qc.invalidateQueries({ queryKey: ['settings'] }) }, onError: (e) => toast.error(friendlyError(e)) })
  if (q.isLoading) return <Spinner />
  return (
    <div className="card card-pad max-w-3xl space-y-5"><div><h2 className="section-title">Campos obrigatórios do perfil</h2><p className="mb-3 text-sm text-ink-soft">Um perfil só pode ser submetido e aprovado com estes campos preenchidos.</p>
      <div className="grid gap-2 sm:grid-cols-2">{ALL_FIELDS.map((f) => <Checkbox key={f} label={FIELD_LABEL[f] ?? f} checked={cur.includes(f)} onChange={(e) => setFields(e.target.checked ? [...cur, f] : cur.filter((x) => x !== f))} />)}</div></div>
      <Field label="Dias antes da validade para alertar documentos" hint="Separe por vírgulas. Ex.: 30, 15, 7">{(i) => <Input id={i} value={curAlerts} onChange={(e) => setAlerts(e.target.value)} />}</Field>
      <Alert tone="info">Moedas suportadas: AOA, USD e EUR, sem conversão automática. Os planos comerciais ainda não têm preços aprovados.</Alert>
      <Button loading={m.isPending} onClick={() => m.mutate()}>Guardar regras</Button></div>
  )
}

function Jobs() {
  const toast = useToast()
  const m = useMutation({ mutationFn: runAlertJobs, onSuccess: (r) => toast.success(`Alertas gerados: ${r.novas_notificacoes} nova(s) notificação(ões).`), onError: (e) => toast.error(friendlyError(e)) })
  return (
    <div className="card card-pad max-w-2xl space-y-3"><h2 className="section-title">Alertas de validade e prazos</h2>
      <p className="text-[15px] text-ink-soft">Gera notificações de documentos a expirar/expirados e de prazos de pedidos a terminar. É idempotente: não duplica alertas já enviados. Em produção deve correr automaticamente (agendamento descrito no README); este botão serve para execução manual.</p>
      <Button loading={m.isPending} onClick={() => m.mutate()}>Executar agora</Button></div>
  )
}

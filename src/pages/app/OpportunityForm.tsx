import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Checkbox, ErrorState, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useCategories, useDocTypes, useSettings } from '@/hooks/useCatalog'
import { friendlyError } from '@/lib/domain/errors'
import { weightsTotal } from '@/lib/domain/evaluation'
import { CURRENCIES, UNITS } from '@/lib/domain/labels'
import { createOpportunity, getOpportunityDetail, updateOpportunity, type CriterionForm, type ItemForm, type OppForm } from '@/services/opportunities'

const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const blank: OppForm = { title: '', description: '', category_id: '', delivery_location: '', deadline: '', currency: 'AOA', commercial_terms: '', technical_requirements: '', required_document_type_ids: [], visibility: 'invited_only', sealed_until_deadline: true }

export default function OpportunityForm() {
  const { id } = useParams()
  const a = useAuth(), nav = useNavigate(), qc = useQueryClient(), toast = useToast()
  const cats = useCategories(), docTypes = useDocTypes(), settings = useSettings()
  const existing = useQuery({ queryKey: ['opp', id], queryFn: () => getOpportunityDetail(id as string), enabled: !!id })
  const [f, setF] = useState<OppForm>(blank)
  const [items, setItems] = useState<ItemForm[]>([{ description: '', quantity: 1, unit: 'un' }])
  const [crit, setCrit] = useState<CriterionForm[]>([])
  const [err, setErr] = useState<Record<string, string>>({})
  const draft = !id || existing.data?.opportunity.status === 'draft'
  useEffect(() => {
    const d = existing.data; if (!d) return
    const o = d.opportunity
    setF({ title: o.title, description: o.description ?? '', category_id: o.category_id ?? '', delivery_location: o.delivery_location ?? '', deadline: toLocal(o.deadline), currency: o.currency, commercial_terms: o.commercial_terms ?? '', technical_requirements: o.technical_requirements ?? '', required_document_type_ids: o.required_document_type_ids, visibility: o.visibility, sealed_until_deadline: o.sealed_until_deadline })
    setItems(d.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit, technical_spec: i.technical_spec ?? '' })))
    setCrit(d.criteria.map((c) => ({ name: c.name, weight: Number(c.weight), kind: c.kind, description: c.description ?? '' })))
  }, [existing.data])
  const m = useMutation({
    mutationFn: async () => {
      if (id) { await updateOpportunity(id, f, items, crit, draft); return id }
      return createOpportunity(a.activeMembership!.organization_id, a.ctx!.profile.id, f, items, crit)
    },
    onSuccess: (oid) => { toast.success('Pedido guardado.'); qc.invalidateQueries({ queryKey: ['opps'] }); qc.invalidateQueries({ queryKey: ['opp', oid] }); nav(`/app/pedidos/${oid}`) },
    onError: (e) => setErr({ form: friendlyError(e) }),
  })
  if (id && existing.isLoading) return <Spinner />
  if (id && existing.isError) return <ErrorState error={existing.error} retry={() => existing.refetch()} />
  const set = <K extends keyof OppForm>(k: K, v: OppForm[K]) => setF((s) => ({ ...s, [k]: v }))
  const submit = () => {
    const e: Record<string, string> = {}
    if (f.title.trim().length < 3) e.title = 'Indique o título do pedido'
    if (draft) {
      if (!f.deadline) e.deadline = 'Indique o prazo'
      else if (new Date(f.deadline).getTime() <= Date.now()) e.deadline = 'O prazo tem de ser futuro'
      if (!items.length || items.some((i) => i.description.trim().length < 2 || !(i.quantity > 0))) e.items = 'Cada item precisa de descrição e quantidade positiva'
      if (crit.length && weightsTotal(crit) !== 100) e.crit = `Os pesos somam ${weightsTotal(crit)} — têm de somar 100`
      if (crit.some((c) => !c.name.trim())) e.crit = 'Todos os critérios precisam de nome'
    }
    setErr(e)
    if (!Object.keys(e).length) m.mutate()
  }
  const upItem = (i: number, p: Partial<ItemForm>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const upCrit = (i: number, p: Partial<CriterionForm>) => setCrit(crit.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const currencies = (settings.data?.supported_currencies as string[] | undefined) ?? CURRENCIES
  return (
    <>
      <PageHeader back={<Link to={id ? `/app/pedidos/${id}` : '/app/pedidos'} className="kbd-link">← Voltar</Link>} title={id ? 'Editar pedido' : 'Novo pedido de cotação'} subtitle={draft ? 'Prepare o pedido. Só será visível a fornecedores depois de publicado.' : 'O pedido já foi publicado: só os textos podem ser alterados e os convidados são notificados. Prazos mudam-se por prorrogação.'} />
      {err.form && <div className="mb-4"><Alert tone="danger">{err.form}</Alert></div>}
      <div className="space-y-6">
        <section className="card card-pad grid gap-4 sm:grid-cols-2" aria-labelledby="g1"><h2 id="g1" className="section-title sm:col-span-2">Informação geral</h2>
          <Field label="Título" error={err.title} required className="sm:col-span-2">{(i, d) => <Input id={i} aria-describedby={d} value={f.title} onChange={(e) => set('title', e.target.value)} />}</Field>
          <Field label="Categoria">{(i) => <Select id={i} value={f.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Sem categoria</option>{cats.data?.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
          <Field label="Local de entrega ou execução">{(i) => <Input id={i} value={f.delivery_location} onChange={(e) => set('delivery_location', e.target.value)} />}</Field>
          <Field label="Prazo para propostas" error={err.deadline} required hint="Hora local do seu dispositivo (Angola: WAT, UTC+1).">{(i, d) => <Input id={i} type="datetime-local" disabled={!draft} aria-describedby={d} value={f.deadline} onChange={(e) => set('deadline', e.target.value)} />}</Field>
          <Field label="Moeda" hint="Todas as propostas serão na moeda do pedido; não há conversão automática.">{(i) => <Select id={i} disabled={!draft} value={f.currency} onChange={(e) => set('currency', e.target.value)}>{currencies.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
          <Field label="Descrição" className="sm:col-span-2">{(i) => <Textarea id={i} rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} />}</Field>
          <Field label="Requisitos técnicos" className="sm:col-span-2">{(i) => <Textarea id={i} rows={3} value={f.technical_requirements} onChange={(e) => set('technical_requirements', e.target.value)} />}</Field>
          <Field label="Condições comerciais" className="sm:col-span-2">{(i) => <Textarea id={i} rows={3} value={f.commercial_terms} onChange={(e) => set('commercial_terms', e.target.value)} />}</Field>
        </section>

        {draft && (
          <section className="card card-pad" aria-labelledby="g2"><h2 id="g2" className="section-title mb-3">Itens e quantidades</h2>
            {err.items && <div className="mb-3"><Alert tone="danger">{err.items}</Alert></div>}
            <div className="space-y-3">{items.map((it, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-12">
                <Field label={`Item ${i + 1}`} className="md:col-span-6">{(id) => <Input id={id} value={it.description} onChange={(e) => upItem(i, { description: e.target.value })} />}</Field>
                <Field label="Quantidade" className="md:col-span-2">{(id) => <Input id={id} type="number" min="0" step="any" value={it.quantity} onChange={(e) => upItem(i, { quantity: Number(e.target.value) })} />}</Field>
                <Field label="Unidade" className="md:col-span-2">{(id) => <Select id={id} value={it.unit} onChange={(e) => upItem(i, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select>}</Field>
                <div className="flex items-end md:col-span-2"><Button variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label={`Remover item ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden />Remover</Button></div>
                <Field label="Especificação técnica (opcional)" className="md:col-span-12">{(id) => <Input id={id} value={it.technical_spec ?? ''} onChange={(e) => upItem(i, { technical_spec: e.target.value })} />}</Field>
              </div>))}</div>
            <Button variant="secondary" className="mt-3" onClick={() => setItems([...items, { description: '', quantity: 1, unit: 'un' }])}><Plus className="h-4 w-4" aria-hidden />Adicionar item</Button>
          </section>
        )}

        {draft && (
          <section className="card card-pad" aria-labelledby="g3"><h2 id="g3" className="section-title">Critérios de avaliação (opcional)</h2>
            <p className="mb-3 mt-1 text-sm text-ink-soft">Sem critérios, a comparação é só por preço e prazo. Com critérios, os pesos são visíveis aos fornecedores e somam 100. A nota ponderada é um apoio: a decisão continua a ser humana e fundamentada.</p>
            {err.crit && <div className="mb-3"><Alert tone="danger">{err.crit}</Alert></div>}
            <div className="space-y-3">{crit.map((c, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-12">
                <Field label="Critério" className="md:col-span-5">{(id) => <Input id={id} value={c.name} onChange={(e) => upCrit(i, { name: e.target.value })} />}</Field>
                <Field label="Tipo" className="md:col-span-3">{(id) => <Select id={id} value={c.kind} onChange={(e) => upCrit(i, { kind: e.target.value as 'technical' | 'commercial' })}><option value="technical">Técnico</option><option value="commercial">Comercial</option></Select>}</Field>
                <Field label="Peso (%)" className="md:col-span-2">{(id) => <Input id={id} type="number" min="1" max="100" value={c.weight} onChange={(e) => upCrit(i, { weight: Number(e.target.value) })} />}</Field>
                <div className="flex items-end md:col-span-2"><Button variant="ghost" onClick={() => setCrit(crit.filter((_, j) => j !== i))} aria-label={`Remover critério ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden />Remover</Button></div>
              </div>))}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={() => setCrit([...crit, { name: '', weight: 0, kind: 'technical' }])}><Plus className="h-4 w-4" aria-hidden />Adicionar critério</Button>{crit.length > 0 && <span className={`text-sm font-semibold ${weightsTotal(crit) === 100 ? 'text-ok' : 'text-warn'}`}>Total dos pesos: {weightsTotal(crit)} / 100</span>}</div>
          </section>
        )}

        <section className="card card-pad space-y-4" aria-labelledby="g4"><h2 id="g4" className="section-title">Acesso e requisitos</h2>
          <Field label="Quem pode responder">{(i) => <Select id={i} disabled={!draft} value={f.visibility} onChange={(e) => set('visibility', e.target.value as OppForm['visibility'])}><option value="invited_only">Apenas fornecedores convidados</option><option value="open_to_qualified">Fornecedores aprovados com serviços da categoria (notificados)</option></Select>}</Field>
          <Checkbox disabled={!draft} checked={f.sealed_until_deadline} onChange={(e) => set('sealed_until_deadline', e.target.checked)} label="Propostas seladas até ao fim do prazo" hint="Recomendado: ninguém da sua empresa vê o conteúdo das propostas antes do prazo terminar." />
          <div><p className="label">Documentos exigidos para submeter proposta</p><p className="hint mb-2">O fornecedor só submete se tiver estes documentos aprovados e em vigor.</p>
            <div className="grid gap-2 sm:grid-cols-2">{docTypes.data?.filter((t) => t.is_active).map((t) => <Checkbox key={t.id} label={t.name} checked={f.required_document_type_ids.includes(t.id)} onChange={(e) => set('required_document_type_ids', e.target.checked ? [...f.required_document_type_ids, t.id] : f.required_document_type_ids.filter((x) => x !== t.id))} />)}</div></div>
        </section>
        <div className="flex justify-end gap-2"><Link to={id ? `/app/pedidos/${id}` : '/app/pedidos'} className="btn-secondary">Cancelar</Link><Button loading={m.isPending} onClick={submit}>{id ? 'Guardar alterações' : 'Guardar rascunho'}</Button></div>
      </div>
    </>
  )
}

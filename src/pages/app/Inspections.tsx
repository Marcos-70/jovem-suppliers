import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea, useToast, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { friendlyError } from '@/lib/domain/errors'
import { formatDate } from '@/lib/domain/format'
import { INSPECTION_STATUS } from '@/lib/domain/labels'
import { P } from '@/lib/domain/permissions'
import type { InspectionMap } from '@/lib/domain/types'
import { createInspectionMap, listInspectionMaps } from '@/services/inspections'

export default function Inspections() {
  const a = useAuth(), nav = useNavigate(), qc = useQueryClient(), toast = useToast()
  const q = useQuery({ queryKey: ['inspections'], queryFn: listInspectionMaps })
  const [open, setOpen] = useState(false), [status, setStatus] = useState('')
  const [f, setF] = useState({ title: '', vessel_name: '', port_location: '', cargo_description: '', tolerance_pct: '0.5' })
  const m = useMutation({
    mutationFn: () => createInspectionMap(a.activeMembership!.organization_id, a.ctx!.profile.id, { title: f.title.trim(), vessel_name: f.vessel_name || null, voyage_ref: null, bl_ref: null, port_location: f.port_location || null, cargo_description: f.cargo_description || null, cargo_owner: null, inspection_date: new Date().toISOString().slice(0, 10), tolerance_pct: Number(f.tolerance_pct), notes: null }),
    onSuccess: (id) => { toast.success('Mapa criado.'); qc.invalidateQueries({ queryKey: ['inspections'] }); setOpen(false); nav(`/app/inspeccoes/${id}`) }, onError: (e) => toast.error(friendlyError(e)),
  })
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const rows = (q.data ?? []).filter((x) => !status || x.status === status)
  const cols: Column<InspectionMap>[] = [
    { key: 'n', header: 'Nº', sort: (x, y) => x.number.localeCompare(y.number), cell: (x) => <span className="font-semibold">{x.number}</span> },
    { key: 't', header: 'Mapa', cell: (x) => <div><Link to={`/app/inspeccoes/${x.id}`} className="kbd-link">{x.title}</Link><p className="text-xs text-ink-mute">{[x.vessel_name, x.port_location].filter(Boolean).join(' · ') || '—'}</p></div> },
    { key: 's', header: 'Estado', cell: (x) => <StatusBadge label={INSPECTION_STATUS[x.status]} /> },
    { key: 'd', header: 'Data', sort: (x, y) => x.inspection_date.localeCompare(y.inspection_date), cell: (x) => formatDate(x.inspection_date) },
  ]
  const canCreate = a.can(P.inspCreate)
  return (
    <>
      <PageHeader title="Mapas de inspecção" subtitle="Controlo de mercadorias: o inspector regista contagens no telemóvel, com diferenças e pesos calculados automaticamente, e gera o relatório digital." actions={canCreate && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Novo mapa</Button>} />
      <div className="mb-3"><Select aria-label="Estado" className="max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os estados</option>{Object.entries(INSPECTION_STATUS).map(([k, l]) => <option key={k} value={k}>{l.text}</option>)}</Select></div>
      <DataTable rows={rows} columns={cols} rowKey={(x) => x.id} caption="Mapas de inspecção" empty={<EmptyState icon={<ClipboardCheck />} title="Ainda sem mapas" action={canCreate ? <Button onClick={() => setOpen(true)}>Criar o primeiro mapa</Button> : undefined}>Cada mapa agrupa as linhas de mercadoria verificadas numa inspecção.</EmptyState>} />
      <Modal open={open} onClose={() => setOpen(false)} title="Novo mapa de inspecção" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={m.isPending} disabled={f.title.trim().length < 3 || !(Number(f.tolerance_pct) >= 0)} onClick={() => m.mutate()}>Criar e preencher</Button></>}>
        <div className="space-y-4">
          <Field label="Título" required>{(i) => <Input id={i} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Descarga de arroz — MV Exemplo" />}</Field>
          <Field label="Navio">{(i) => <Input id={i} value={f.vessel_name} onChange={(e) => setF({ ...f, vessel_name: e.target.value })} />}</Field>
          <Field label="Porto / local">{(i) => <Input id={i} value={f.port_location} onChange={(e) => setF({ ...f, port_location: e.target.value })} />}</Field>
          <Field label="Mercadoria">{(i) => <Textarea id={i} rows={2} value={f.cargo_description} onChange={(e) => setF({ ...f, cargo_description: e.target.value })} />}</Field>
          <Field label="Tolerância de diferença (%)" hint="Valor inicial 0,5 %, configurável por mapa. Não é uma norma: defina conforme o contrato.">{(i) => <Input id={i} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={f.tolerance_pct} onChange={(e) => setF({ ...f, tolerance_pct: e.target.value })} />}</Field>
          {m.isError && <Alert tone="danger">{friendlyError(m.error)}</Alert>}
        </div>
      </Modal>
    </>
  )
}

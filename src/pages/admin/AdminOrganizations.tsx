import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, Badge, Button, DataTable, DescriptionList, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea, useToast, type Column } from '@/components/ui'
import { useCategories } from '@/hooks/useCatalog'
import { friendlyError } from '@/lib/domain/errors'
import { formatDate, formatDateTime } from '@/lib/domain/format'
import { ORG_TYPE_LABEL, PROFILE_STATUS, VERIFICATION_STATUS } from '@/lib/domain/labels'
import { FIELD_LABEL, missingProfileFields } from '@/lib/domain/profile'
import type { Organization } from '@/lib/domain/types'
import { listServices, adminListOrganizations, reviewProfile, setOrgActive, setVerification } from '@/services/organizations'

export default function AdminOrganizations() {
  const q = useQuery({ queryKey: ['admin-orgs'], queryFn: adminListOrganizations })
  const [status, setStatus] = useState(''), [term, setTerm] = useState(''), [sel, setSel] = useState<Organization | null>(null)
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const rows = (q.data ?? []).filter((o) => (!status || o.profile_status === status) && (!term || `${o.legal_name} ${o.trade_name ?? ''} ${o.nif}`.toLowerCase().includes(term.toLowerCase())))
  const pending = (q.data ?? []).filter((o) => ['submitted', 'under_review'].includes(o.profile_status)).length
  const cols: Column<Organization>[] = [
    { key: 'n', header: 'Organização', sort: (x, y) => x.legal_name.localeCompare(y.legal_name), cell: (o) => <div><button className="kbd-link text-left" onClick={() => setSel(o)}>{o.trade_name || o.legal_name}</button><p className="text-xs text-ink-mute">NIF {o.nif} · {ORG_TYPE_LABEL[o.org_type]}</p></div> },
    { key: 'p', header: 'Perfil', cell: (o) => <StatusBadge label={PROFILE_STATUS[o.profile_status]} /> }, { key: 'v', header: 'Verificação', cell: (o) => <Badge tone={VERIFICATION_STATUS[o.verification_status].tone}>{VERIFICATION_STATUS[o.verification_status].text}</Badge> },
    { key: 'l', header: 'Província', cell: (o) => o.province ?? '—' }, { key: 'a', header: 'Activa', cell: (o) => (o.is_active ? 'Sim' : <Badge tone="danger">Não</Badge>) },
    { key: 's', header: 'Submetido', cell: (o) => formatDate(o.submitted_at), sort: (x, y) => (x.submitted_at ?? '').localeCompare(y.submitted_at ?? '') },
  ]
  return (
    <>
      <PageHeader title="Organizações" subtitle={pending ? `${pending} perfil(is) a aguardar análise.` : 'Análise de perfis, verificação e activação.'} />
      <div className="mb-3 flex flex-wrap gap-3"><Input aria-label="Pesquisar" className="max-w-xs" placeholder="Nome ou NIF" value={term} onChange={(e) => setTerm(e.target.value)} />
        <Select aria-label="Estado do perfil" className="max-w-[240px]" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os estados</option>{Object.entries(PROFILE_STATUS).map(([k, l]) => <option key={k} value={k}>{l.text}</option>)}</Select></div>
      <DataTable rows={rows} columns={cols} rowKey={(o) => o.id} caption="Organizações registadas" empty={<EmptyState title="Sem organizações" />} />
      <ReviewModal org={sel} onClose={() => setSel(null)} />
    </>
  )
}

function ReviewModal({ org, onClose }: { org: Organization | null; onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast(), cats = useCategories()
  const [reason, setReason] = useState(''), [scope, setScope] = useState('')
  const sv = useQuery({ queryKey: ['services', org?.id], queryFn: () => listServices(org!.id), enabled: !!org })
  const done = (msg: string) => () => { toast.success(msg); setReason(''); setScope(''); qc.invalidateQueries({ queryKey: ['admin-orgs'] }); qc.invalidateQueries({ queryKey: ['reportData'] }); onClose() }
  const review = useMutation({ mutationFn: (r: string) => reviewProfile(org!.id, r, reason), onSuccess: done('Decisão registada e organização notificada.'), onError: (e) => toast.error(friendlyError(e)) })
  const verify = useMutation({ mutationFn: (s: string) => setVerification(org!.id, s, scope), onSuccess: done('Verificação actualizada.'), onError: (e) => toast.error(friendlyError(e)) })
  const active = useMutation({ mutationFn: () => setOrgActive(org!.id, !org!.is_active), onSuccess: done('Estado da organização actualizado.'), onError: (e) => toast.error(friendlyError(e)) })
  if (!org) return null
  const miss = missingProfileFields(org, sv.data?.length ?? 0)
  const needReason = reason.trim().length < 5
  return (
    <Modal open onClose={onClose} wide title={org.trade_name || org.legal_name}>
      <div className="space-y-5">
        <DescriptionList cols={3} items={[{ label: 'Nome legal', value: org.legal_name }, { label: 'NIF', value: org.nif }, { label: 'Tipo', value: ORG_TYPE_LABEL[org.org_type] }, { label: 'Sector', value: org.sector }, { label: 'Local', value: [org.municipality, org.province].filter(Boolean).join(', ') }, { label: 'Contacto', value: [org.phone, org.email].filter(Boolean).join(' · ') }, { label: 'Estado do perfil', value: <StatusBadge label={PROFILE_STATUS[org.profile_status]} /> }, { label: 'Submetido', value: formatDateTime(org.submitted_at) }, { label: 'Visibilidade', value: org.visibility }]} />
        <p className="text-[15px] text-ink-soft">{org.description || 'Sem descrição.'}</p>
        <p className="text-sm"><strong>Serviços:</strong> {sv.data?.map((s) => `${s.name} (${cats.data?.find((c) => c.id === s.category_id)?.name})`).join('; ') || 'nenhum'}</p>
        {miss.length > 0 ? <Alert tone="warn" title="Campos obrigatórios em falta">{miss.map((m) => FIELD_LABEL[m] ?? m).join(', ')}</Alert> : <Alert tone="ok">Perfil completo.</Alert>}
        <section className="rounded-card border border-line p-4"><h3 className="section-title !text-base mb-2">Análise do perfil</h3>
          <Field label="Motivo / indicações (obrigatório para correcções, rejeição e suspensão)">{(i) => <Textarea id={i} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" small loading={review.isPending && review.variables === 'under_review'} onClick={() => review.mutate('under_review')}>Marcar em análise</Button>
            <Button small disabled={miss.length > 0} loading={review.isPending && review.variables === 'approved'} onClick={() => review.mutate('approved')}>Aprovar</Button>
            <Button variant="secondary" small disabled={needReason} onClick={() => review.mutate('corrections_pending')}>Pedir correcções</Button>
            <Button variant="danger" small disabled={needReason} onClick={() => review.mutate('rejected')}>Rejeitar</Button>
            <Button variant="danger" small disabled={needReason} onClick={() => review.mutate('suspended')}>Suspender</Button></div></section>
        <section className="rounded-card border border-line p-4"><h3 className="section-title !text-base mb-1">Verificação</h3>
          <p className="mb-2 text-sm text-ink-soft">Só marque como verificado o que foi confirmado por documentos aprovados. O âmbito aparece publicamente junto ao selo.</p>
          <Field label="Âmbito da verificação">{(i) => <Input id={i} placeholder="Ex.: Registo comercial e NIF verificados" value={scope} onChange={(e) => setScope(e.target.value)} />}</Field>
          <div className="mt-3 flex flex-wrap gap-2"><Button small disabled={scope.trim().length < 5} loading={verify.isPending && verify.variables === 'verified'} onClick={() => verify.mutate('verified')}>Marcar como verificada</Button><Button variant="secondary" small onClick={() => verify.mutate('in_progress')}>Verificação em curso</Button><Button variant="secondary" small onClick={() => verify.mutate('not_verified')}>Remover verificação</Button></div></section>
        <div className="flex justify-end"><Button variant={org.is_active ? 'danger' : 'secondary'} small loading={active.isPending} onClick={() => active.mutate()}>{org.is_active ? 'Desactivar organização' : 'Reactivar organização'}</Button></div>
      </div>
    </Modal>
  )
}

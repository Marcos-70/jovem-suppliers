import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Alert, Badge, Button, DataTable, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, useToast, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { friendlyError } from '@/lib/domain/errors'
import { formatDate } from '@/lib/domain/format'
import { ROLE_LABEL } from '@/lib/domain/labels'
import { PERMISSION_LABEL, ROLE_PERMISSIONS } from '@/lib/domain/permissions'
import type { AppRole } from '@/lib/domain/types'
import { addMember, listMembers, setMemberActive, type Member } from '@/services/organizations'

export default function Team() {
  const a = useAuth(), qc = useQueryClient(), toast = useToast()
  const org = a.activeMembership!
  const q = useQuery({ queryKey: ['members', org.organization_id], queryFn: () => listMembers(org.organization_id) })
  const [open, setOpen] = useState(false), [email, setEmail] = useState(''), [role, setRole] = useState<AppRole>('doc_operator'), [err, setErr] = useState<string>()
  const roles = (['org_admin', 'supplier', 'buyer', 'procurement_qualifier', 'doc_operator', 'inspector', 'auditor'] as AppRole[]).filter((r) => (r === 'supplier' ? a.isSupplierOrg : r === 'buyer' || r === 'procurement_qualifier' ? a.isBuyerOrg : true))
  const refresh = () => qc.invalidateQueries({ queryKey: ['members'] })
  const add = useMutation({ mutationFn: () => addMember(org.organization_id, email, role), onSuccess: () => { toast.success('Função atribuída.'); setOpen(false); setEmail(''); setErr(undefined); refresh() }, onError: (e) => setErr(friendlyError(e)) })
  const toggle = useMutation({ mutationFn: (m: Member) => setMemberActive(m.member_id, !m.is_active), onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)) })
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const cols: Column<Member>[] = [
    { key: 'n', header: 'Utilizador', cell: (m) => <div><span className="font-semibold">{m.full_name}</span>{m.user_id === a.ctx?.profile.id && <span className="ml-1.5 text-xs text-ink-mute">(você)</span>}<p className="text-xs text-ink-mute">{m.email}</p></div> },
    { key: 'r', header: 'Função', cell: (m) => ROLE_LABEL[m.role] }, { key: 's', header: 'Estado', cell: (m) => (m.is_active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>) },
    { key: 'c', header: 'Desde', cell: (m) => formatDate(m.created_at) },
    { key: 'a', header: '', cell: (m) => m.user_id === a.ctx?.profile.id ? <span className="text-xs text-ink-mute">Não pode alterar as próprias funções</span> : <Button variant="secondary" small loading={toggle.isPending && toggle.variables?.member_id === m.member_id} onClick={() => toggle.mutate(m)}>{m.is_active ? 'Desactivar' : 'Reactivar'}</Button> },
  ]
  return (
    <>
      <PageHeader title="Equipa e funções" subtitle="Quem tem acesso à organização e com que permissões. As funções são atribuídas por um administrador e nunca a si próprio." actions={<Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" aria-hidden />Atribuir função</Button>} />
      <DataTable rows={q.data ?? []} columns={cols} rowKey={(m) => m.member_id} caption="Membros da organização" />
      <section className="mt-8"><h2 className="section-title mb-3">O que cada função permite</h2>
        <div className="grid gap-3 md:grid-cols-2">{roles.map((r) => (
          <details key={r} className="card p-4"><summary className="cursor-pointer font-semibold text-navy">{ROLE_LABEL[r]}</summary><ul className="mt-2 grid gap-x-4 gap-y-1 text-sm text-ink-soft sm:grid-cols-2">{ROLE_PERMISSIONS[r].map((p) => <li key={p}>• {PERMISSION_LABEL[p]}</li>)}</ul></details>))}</div></section>
      <Modal open={open} onClose={() => setOpen(false)} title="Atribuir função" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={add.isPending} disabled={!email.includes('@')} onClick={() => add.mutate()}>Atribuir</Button></>}>
        <div className="space-y-4">{err && <Alert tone="danger">{err}</Alert>}<p className="text-sm text-ink-soft">A pessoa tem de já ter conta na plataforma. Peça-lhe que se registe primeiro.</p>
          <Field label="E-mail da pessoa" required>{(i) => <Input id={i} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label="Função">{(i) => <Select id={i} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>}</Field></div>
      </Modal>
    </>
  )
}

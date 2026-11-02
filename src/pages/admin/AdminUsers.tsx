import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DataTable, ErrorState, PageHeader, Spinner, useToast, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { friendlyError } from '@/lib/domain/errors'
import { formatDate } from '@/lib/domain/format'
import { adminListUsers, adminSetUserActive, type PlatformUser } from '@/services/organizations'

export default function AdminUsers() {
  const a = useAuth(), qc = useQueryClient(), toast = useToast()
  const q = useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers })
  const m = useMutation({ mutationFn: (u: PlatformUser) => adminSetUserActive(u.id, !u.is_active), onSuccess: () => { toast.success('Utilizador actualizado.'); qc.invalidateQueries({ queryKey: ['admin-users'] }) }, onError: (e) => toast.error(friendlyError(e)) })
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const cols: Column<PlatformUser>[] = [
    { key: 'n', header: 'Utilizador', sort: (x, y) => x.full_name.localeCompare(y.full_name), cell: (u) => <div><span className="font-semibold">{u.full_name || '—'}</span>{u.is_superadmin && <span className="ml-2"><Badge tone="info">Superadmin</Badge></span>}<p className="text-xs text-ink-mute">{u.email}</p></div> },
    { key: 'o', header: 'Organizações', align: 'right', cell: (u) => u.organizations }, { key: 's', header: 'Estado', cell: (u) => (u.is_active ? <Badge tone="ok">Activo</Badge> : <Badge tone="danger">Bloqueado</Badge>) },
    { key: 'c', header: 'Registo', cell: (u) => formatDate(u.created_at) },
    { key: 'a', header: '', cell: (u) => u.id === a.ctx?.profile.id ? <span className="text-xs text-ink-mute">A sua conta</span> : <Button variant={u.is_active ? 'danger' : 'secondary'} small loading={m.isPending && m.variables?.id === u.id} onClick={() => m.mutate(u)}>{u.is_active ? 'Bloquear' : 'Desbloquear'}</Button> },
  ]
  return (<><PageHeader title="Utilizadores" subtitle="Bloquear impede o acesso mas preserva todo o histórico. Superadministradores só se criam por procedimento de servidor (ver README)." /><DataTable rows={q.data ?? []} columns={cols} rowKey={(u) => u.id} caption="Utilizadores da plataforma" /></>)
}

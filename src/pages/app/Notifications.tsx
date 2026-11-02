import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, ErrorState, PageHeader, Spinner, useToast } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { friendlyError } from '@/lib/domain/errors'
import { formatDateTime } from '@/lib/domain/format'
import type { AppNotification } from '@/lib/domain/types'
import { listNotifications, markAllRead, markRead } from '@/services/notifications'

export default function Notifications() {
  const a = useAuth(), qc = useQueryClient(), toast = useToast()
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => listNotifications() })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['unread'] }) }
  const one = useMutation({ mutationFn: markRead, onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)) })
  const all = useMutation({ mutationFn: () => markAllRead(a.ctx!.profile.id), onSuccess: () => { toast.success('Todas marcadas como lidas.'); refresh() }, onError: (e) => toast.error(friendlyError(e)) })
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const link = (n: AppNotification) => {
    if (n.entity_type === 'opportunity' && n.entity_id) return `/app/pedidos/${n.entity_id}`
    if (n.entity_type === 'proposal') return a.isSupplierOrg && !a.isSuper ? '/app/propostas' : '/app/pedidos'
    if (n.entity_type === 'document') return a.isSuper ? '/app/admin/documentos' : '/app/documentos'
    if (n.entity_type === 'organization') return a.isSuper ? '/app/admin/organizacoes' : '/app/empresa'
    return null
  }
  const unread = (q.data ?? []).filter((n) => !n.read_at).length
  return (
    <>
      <PageHeader title="Notificações" subtitle="Alertas dentro da plataforma. As notificações por e-mail ainda não estão activas (requer configuração do serviço de e-mail)." actions={unread > 0 && <Button variant="secondary" loading={all.isPending} onClick={() => all.mutate()}><CheckCheck className="h-4 w-4" aria-hidden />Marcar todas como lidas</Button>} />
      {!q.data?.length ? <div className="card"><EmptyState icon={<Bell />} title="Sem notificações">Os convites, prazos, resultados de análises e decisões aparecem aqui.</EmptyState></div> : (
        <ul className="card divide-y divide-line overflow-hidden">{q.data.map((n) => { const to = link(n); return (
          <li key={n.id} className={`flex items-start gap-3 px-4 py-3.5 ${n.read_at ? '' : 'bg-brand-50/60'}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-brand'}`} aria-label={n.read_at ? 'Lida' : 'Por ler'} role="img" />
            <div className="min-w-0 flex-1"><p className="font-semibold text-navy">{n.title}</p>{n.body && <p className="text-[15px] text-ink-soft">{n.body}</p>}<p className="mt-0.5 text-xs text-ink-mute">{formatDateTime(n.created_at)}</p></div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">{to && <Link to={to} onClick={() => !n.read_at && one.mutate(n.id)} className="kbd-link text-sm">Abrir</Link>}{!n.read_at && <button className="text-sm text-ink-mute underline" onClick={() => one.mutate(n.id)}>Marcar como lida</button>}</div>
          </li>) })}</ul>
      )}
    </>
  )
}

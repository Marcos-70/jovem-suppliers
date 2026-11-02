import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/supabase'
import { fetchAll } from '@/services/core'

/** Nomes das organizações visíveis ao utilizador (vista supplier_directory). */
export function useOrgNames() {
  const q = useQuery({
    queryKey: ['orgNames'], staleTime: 60_000,
    queryFn: () => fetchAll<{ id: string; legal_name: string; trade_name: string | null }>((a, b) => db.from('supplier_directory').select('id,legal_name,trade_name').range(a, b)),
  })
  const map = new Map((q.data ?? []).map((o) => [o.id, o.trade_name || o.legal_name]))
  return { name: (id: string | null | undefined) => (id ? map.get(id) ?? 'Organização' : '—'), ready: !q.isLoading }
}

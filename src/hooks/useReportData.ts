import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { loadReportData } from '@/services/reportData'

export function useReportData(enabled = true) {
  const a = useAuth()
  return useQuery({
    queryKey: ['reportData', a.isSuper, a.activeMembership?.organization_id],
    queryFn: () => loadReportData(a.isSuper),
    enabled: enabled && a.authenticated, staleTime: 30_000,
  })
}

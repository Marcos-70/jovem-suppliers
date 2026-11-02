import { useQuery } from '@tanstack/react-query'
import { getCategories, getDocumentTypes, getRequirements, getSettings } from '@/services/catalog'

export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: 5 * 60_000 })
export const useDocTypes = () => useQuery({ queryKey: ['docTypes'], queryFn: getDocumentTypes, staleTime: 5 * 60_000 })
export const useRequirements = () => useQuery({ queryKey: ['requirements'], queryFn: getRequirements, staleTime: 5 * 60_000 })
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 5 * 60_000 })

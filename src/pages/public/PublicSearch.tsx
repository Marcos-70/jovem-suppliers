import { useParams } from 'react-router-dom'
import { SupplierProfile, SupplierSearch } from '@/components/SupplierViews'

export function PublicSearch() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-[30px] font-bold">Procurar fornecedores</h1>
      <p className="mb-6 mt-1 max-w-2xl text-ink-soft">Empresas que autorizaram a sua visibilidade pública. Os contactos só aparecem quando a empresa os disponibiliza.</p>
      <SupplierSearch basePath="/fornecedores-publico" />
    </div>
  )
}
export function PublicSupplier() {
  const { id } = useParams()
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><SupplierProfile id={id as string} backTo="/fornecedores-publico" isPublic /></div>
}

import { useParams } from 'react-router-dom'
import { SupplierProfile, SupplierSearch } from '@/components/SupplierViews'
import { PageHeader } from '@/components/ui'

export function Suppliers() {
  return (<><PageHeader title="Fornecedores" subtitle="Pesquise por serviço, categoria, província, verificação e documentos válidos. Só vê o que cada empresa autorizou." /><SupplierSearch basePath="/app/fornecedores" showDocFilter /></>)
}
export function SupplierDetail() {
  const { id } = useParams()
  return <SupplierProfile id={id as string} backTo="/app/fornecedores" />
}

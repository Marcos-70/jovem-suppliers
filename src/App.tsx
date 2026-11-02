import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout, { RequirePerm } from '@/components/layout/AppLayout'
import PublicLayout from '@/components/layout/PublicLayout'
import { Spinner } from '@/components/ui'
import { P } from '@/lib/domain/permissions'
import Landing from '@/pages/public/Landing'
import { ForgotPassword, Login, Register, ResetPassword } from '@/pages/public/AuthPages'
import { NotFound, Plans, Privacy, Terms } from '@/pages/public/LegalPages'
import { PublicSearch, PublicSupplier } from '@/pages/public/PublicSearch'

const Dashboard = lazy(() => import('@/pages/app/Dashboard'))
const AdminDash = lazy(() => import('@/pages/app/Dashboard').then((m) => ({ default: m.AdminDashboard })))
const Company = lazy(() => import('@/pages/app/Company'))
const Documents = lazy(() => import('@/pages/app/Documents'))
const Opportunities = lazy(() => import('@/pages/app/Opportunities'))
const OpportunityForm = lazy(() => import('@/pages/app/OpportunityForm'))
const OpportunityDetail = lazy(() => import('@/pages/app/OpportunityDetail'))
const Proposals = lazy(() => import('@/pages/app/Proposals'))
const ProposalForm = lazy(() => import('@/pages/app/ProposalForm'))
const Reports = lazy(() => import('@/pages/app/Reports'))
const Team = lazy(() => import('@/pages/app/Team'))
const Audit = lazy(() => import('@/pages/app/Audit'))
const Notifications = lazy(() => import('@/pages/app/Notifications'))
const Settings = lazy(() => import('@/pages/app/Settings'))
const Modules = lazy(() => import('@/pages/app/Modules'))
const Inspections = lazy(() => import('@/pages/app/Inspections'))
const InspectionDetail = lazy(() => import('@/pages/app/InspectionDetail'))
const InspectionReport = lazy(() => import('@/pages/app/InspectionReport'))
const SmartHoldScan = lazy(() => import('@/pages/app/SmartHoldScan'))
const Suppliers = lazy(() => import('@/pages/app/Suppliers').then((m) => ({ default: m.Suppliers })))
const SupplierDetail = lazy(() => import('@/pages/app/Suppliers').then((m) => ({ default: m.SupplierDetail })))
const AdminOrganizations = lazy(() => import('@/pages/admin/AdminOrganizations'))
const AdminDocuments = lazy(() => import('@/pages/admin/AdminDocuments'))
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminConfig = lazy(() => import('@/pages/admin/AdminConfig'))

const R = (p: { perm?: string; anyOf?: string[]; needsOrg?: boolean; orgKind?: 'buyer' | 'supplier'; children: React.ReactNode }) => <RequirePerm {...p} />

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="fornecedores-publico" element={<PublicSearch />} />
          <Route path="fornecedores-publico/:id" element={<PublicSupplier />} />
          <Route path="entrar" element={<Login />} />
          <Route path="registar" element={<Register />} />
          <Route path="recuperar-palavra-passe" element={<ForgotPassword />} />
          <Route path="redefinir-palavra-passe" element={<ResetPassword />} />
          <Route path="termos" element={<Terms />} />
          <Route path="privacidade" element={<Privacy />} />
          <Route path="planos" element={<Plans />} />
        </Route>
        <Route path="app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="fornecedores" element={<R perm={P.supplierSearch}><Suppliers /></R>} />
          <Route path="fornecedores/:id" element={<R perm={P.supplierSearch}><SupplierDetail /></R>} />
          <Route path="empresa" element={<R perm={P.orgView} needsOrg><Company /></R>} />
          <Route path="documentos" element={<R perm={P.docView} needsOrg><Documents /></R>} />
          <Route path="pedidos" element={<R perm={P.oppView}><Opportunities /></R>} />
          <Route path="pedidos/novo" element={<R perm={P.oppCreate} needsOrg orgKind="buyer"><OpportunityForm /></R>} />
          <Route path="pedidos/:id" element={<R perm={P.oppView}><OpportunityDetail /></R>} />
          <Route path="pedidos/:id/editar" element={<R perm={P.oppManage} needsOrg orgKind="buyer"><OpportunityForm /></R>} />
          <Route path="pedidos/:id/proposta" element={<R perm={P.propSubmit} needsOrg orgKind="supplier"><ProposalForm /></R>} />
          <Route path="propostas" element={<R perm={P.propView} needsOrg orgKind="supplier"><Proposals /></R>} />
          <Route path="inspeccoes" element={<R perm={P.inspView} needsOrg><Inspections /></R>} />
          <Route path="inspeccoes/:id" element={<R perm={P.inspView} needsOrg><InspectionDetail /></R>} />
          <Route path="inspeccoes/:id/relatorio" element={<R perm={P.inspView} needsOrg><InspectionReport /></R>} />
          <Route path="smart-hold-scan" element={<R perm={P.scanView} needsOrg><SmartHoldScan /></R>} />
          <Route path="relatorios" element={<R perm={P.reportView}><Reports /></R>} />
          <Route path="equipa" element={<R perm={P.membersManage} needsOrg><Team /></R>} />
          <Route path="auditoria" element={<R perm={P.auditView}><Audit /></R>} />
          <Route path="notificacoes" element={<Notifications />} />
          <Route path="definicoes" element={<Settings />} />
          <Route path="modulos" element={<Modules />} />
          <Route path="admin" element={<R perm={P.adminAccess}><AdminDash /></R>} />
          <Route path="admin/organizacoes" element={<R perm={P.adminOrgs}><AdminOrganizations /></R>} />
          <Route path="admin/documentos" element={<R perm={P.docReview}><AdminDocuments /></R>} />
          <Route path="admin/utilizadores" element={<R perm={P.adminUsers}><AdminUsers /></R>} />
          <Route path="admin/configuracoes" element={<R perm={P.adminConfig}><AdminConfig /></R>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="login" element={<Navigate to="/entrar" replace />} />
        <Route path="*" element={<PublicLayout />}><Route path="*" element={<NotFound />} /></Route>
      </Routes>
    </Suspense>
  )
}

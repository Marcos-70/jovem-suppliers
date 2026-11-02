import { Boxes, ClipboardCheck, HardHat, ScanLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, Badge, PageHeader } from '@/components/ui'

const live = [
  { icon: <ClipboardCheck />, name: 'Mapas de inspecção', desc: 'Controlo de mercadorias no telemóvel: contagens, avarias, diferenças e pesos calculados, e relatório digital.', to: '/app/inspeccoes', tag: 'Disponível' },
  { icon: <ScanLine />, name: 'JOVEM+ SMART HOLD SCAN', desc: 'Digitalização 3D de porões: capturar ou importar, visualizar, medir, exportar e validar a precisão. Volume de carga ainda não activo.', to: '/app/smart-hold-scan', tag: 'Protótipo — fase 1' },
]
const mods = [
  { icon: <HardHat />, name: 'JOVEM+ WORKFORCE', desc: 'Trabalhadores, competências, formações e certificações.' },
  { icon: <Boxes />, name: 'JOVEM+ ASSETS', desc: 'Equipamentos, manutenção, inspecções e documentação técnica.' },
  { icon: <ClipboardCheck />, name: 'JOVEM+ OPERATIONS', desc: 'Tarefas, solicitações, ocorrências, prazos e execução operacional.' },
]
export default function Modules() {
  return (
    <>
      <PageHeader title="Módulos JOVEM+ BUSINESS" subtitle="A plataforma cresce por módulos que reutilizam autenticação, organizações, permissões, documentos, notificações e auditoria." />
      <div className="mb-6 grid gap-4 md:grid-cols-2">{live.map((m) => <Link key={m.name} to={m.to} className="card block p-5 !text-ink hover:shadow-pop"><span className="grid h-11 w-11 place-items-center rounded-lg bg-gold-50 text-gold-700 [&_svg]:h-5 [&_svg]:w-5" aria-hidden>{m.icon}</span><h2 className="mt-3 text-lg font-semibold">{m.name}</h2><p className="mt-1 text-[15px] text-ink-soft">{m.desc}</p><p className="mt-3"><Badge tone="ok">{m.tag}</Badge></p></Link>)}</div>
      <h2 className="section-title mb-3">Em planeamento</h2>
      <div className="mb-5 max-w-3xl"><Alert tone="neutral">Nenhum destes módulos está desenvolvido nesta versão. Estão aqui apenas para mostrar a direcção do produto.</Alert></div>
      <div className="grid gap-4 md:grid-cols-3">{mods.map((m) => <div key={m.name} className="card p-5"><span className="grid h-11 w-11 place-items-center rounded-lg bg-surface text-ink-soft [&_svg]:h-5 [&_svg]:w-5" aria-hidden>{m.icon}</span><h2 className="mt-3 text-lg font-semibold">{m.name}</h2><p className="mt-1 text-[15px] text-ink-soft">{m.desc}</p><p className="mt-3"><Badge>Em planeamento — indisponível</Badge></p></div>)}</div>
    </>
  )
}

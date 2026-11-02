import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui'

function Doc({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-[30px] font-bold">{title}</h1>
      <div className="my-5"><Alert tone="warn" title="Minuta para revisão jurídica">Este texto é uma base de trabalho. Deve ser revisto por um jurista e adaptado à legislação angolana aplicável (incluindo protecção de dados) antes da entrada em produção.</Alert></div>
      <div className="space-y-5 text-[15px] leading-relaxed text-ink [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
    </div>
  )
}

export function Terms() {
  return (
    <Doc title="Termos de utilização">
      <p>A JOVEM+ SUPPLIERS é uma plataforma que facilita o contacto entre empresas fornecedoras e empresas compradoras. A plataforma não é parte em contratos celebrados entre utilizadores.</p>
      <h2>1. Contas e organizações</h2>
      <p>Cada organização é responsável pela veracidade dos dados que declara e pelas acções dos seus utilizadores. As funções e permissões são atribuídas pelo administrador da organização.</p>
      <h2>2. Verificação</h2>
      <p>O estado «Verificado» refere-se apenas ao âmbito indicado no perfil (por exemplo, registo comercial e NIF). Não constitui garantia de qualidade, capacidade técnica ou idoneidade.</p>
      <h2>3. Pedidos, propostas e decisões</h2>
      <ul>
        <li>As propostas submetidas ficam registadas com versão e hora de recepção.</li>
        <li>Uma decisão comercial registada na plataforma não constitui, por si só, um contrato.</li>
        <li>Os valores são apresentados na moeda indicada; não há conversão automática entre moedas.</li>
      </ul>
      <h2>4. Documentos</h2>
      <p>Os utilizadores só devem carregar documentos que possam legitimamente partilhar. Os documentos são tratados como confidenciais e acedidos apenas por quem tem permissão.</p>
      <h2>5. Utilização aceitável</h2>
      <p>É proibido tentar aceder a dados de outras organizações, contornar controlos de segurança ou usar a plataforma para fins ilícitos.</p>
      <p className="text-ink-mute">Consulte também a <Link to="/privacidade" className="kbd-link">Política de privacidade</Link>.</p>
    </Doc>
  )
}

export function Privacy() {
  return (
    <Doc title="Política de privacidade">
      <p>Esta política descreve, em termos gerais, como são tratados os dados pessoais e empresariais na plataforma.</p>
      <h2>Dados tratados</h2>
      <ul><li>Dados de conta (nome, e-mail, telefone, função).</li><li>Dados da empresa (identificação, contactos, serviços, documentos).</li><li>Registos de actividade e auditoria de acções críticas.</li></ul>
      <h2>Visibilidade</h2>
      <p>Os perfis são privados por omissão. A empresa escolhe se aparece a utilizadores autenticados ou publicamente e quais os campos opcionais (como telefone ou e-mail) que mostra. O consentimento fica registado com data.</p>
      <h2>Documentos</h2>
      <p>Os ficheiros ficam em armazenamento privado. Terceiros só os consultam quando existe relação autorizada (por exemplo, a empresa respondeu a um pedido do comprador) e o acesso é registado.</p>
      <h2>Direitos dos titulares</h2>
      <p>Os titulares podem pedir acesso, correcção ou apagamento dos seus dados, sem prejuízo de obrigações legais de conservação. Os contactos para exercício de direitos devem ser indicados pela entidade responsável antes da produção.</p>
    </Doc>
  )
}

export function Plans() {
  const plans = [
    { n: 'Starter', price: 'Gratuito', d: 'Acesso básico: perfil, serviços e documentos.' },
    { n: 'Professional', price: '15.000 Kz/mês', d: 'Mais funcionalidades para fornecedores.', hl: true },
    { n: 'Business', price: '35.000 Kz/mês', d: 'Para empresas compradoras.' },
    { n: 'Enterprise', price: 'Preço negociado', d: 'Soluções personalizadas.' },
  ]
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-[30px] font-bold">Estrutura de planos</h1>
      <div className="my-4 max-w-3xl"><Alert tone="info" title="Sugestão inicial">Valores propostos para discussão. Ainda não existe cobrança nem subscrição na plataforma; os planos não limitam funcionalidades nesta versão.</Alert></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{plans.map((p) => <div key={p.n} className={`card p-6 text-center ${p.hl ? 'border-gold ring-2 ring-gold' : ''}`}><h2 className="text-lg font-semibold">{p.n}</h2><p className="mt-3 font-display text-xl font-bold text-navy">{p.price}</p><p className="mt-2 text-sm text-ink-soft">{p.d}</p></div>)}</div>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="font-display text-6xl font-extrabold text-brand">404</p>
      <h1 className="mt-2 text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-ink-soft">O endereço pode estar errado ou a página já não existe.</p>
      <Link to="/" className="btn-primary mt-6">Ir para o início</Link>
    </div>
  )
}

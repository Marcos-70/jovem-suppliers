import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { ToastProvider } from '@/components/ui'
import { AuthProvider } from '@/hooks/useAuth'
import { db } from '@/lib/supabase'
import { IS_DEMO } from '@/lib/env'

const E = (n: string) => `${n}@jovemplus.test`
const ACC = { admin: E('admin'), paulo: E('paulo.ferreira'), ana: E('ana.baptista'), joana: E('joana.pires'), rui: E('rui.cardoso'), carlos: E('carlos.neto'), marta: E('marta.gomes'), elias: E('elias.tavares'), luzia: E('luzia.costa'), helder: E('helder.quintas') }

async function open(path: string, as?: string) {
  await db.auth.signOut()
  if (as) await db.auth.signInWithPassword({ email: as, password: 'x' })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></MemoryRouter></QueryClientProvider>)
}
const heading = (name: string | RegExp, level = 1) => screen.findByRole('heading', { name, level }, { timeout: 4000 })
const field = (scope: HTMLElement, label: RegExp) => within(scope).getByLabelText(label) as HTMLInputElement

let errors: unknown[][] = []
beforeAll(() => { expect(IS_DEMO).toBe(true); vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a) }) })
afterEach(() => { cleanup(); const e = errors.filter((x) => !/not wrap|act\(|ResponsiveContainer|width\(0\)|height\(0\)|WebGL|HTMLCanvasElement/i.test(String(x[0]))); errors = []; expect(e.map((x) => x.map(String).join(' ').slice(0, 400)).join(' || '), 'erros no consola').toBe('') })

describe('área pública e acesso', () => {
  it('landing e login não mostram nenhum aviso de demonstração', async () => {
    await open('/')
    await heading(/Conectando fornecedores angolanos/)
    expect(screen.queryByText(/demonstra/i)).not.toBeInTheDocument()
    cleanup()
    await open('/entrar')
    await heading('Bem-vindo(a)!')
    expect(screen.queryByText(/demonstra|fictícios|em memória/i)).not.toBeInTheDocument()
    for (const g of ['Atlântico Inspecções e Controlo, Lda', 'Porto Grãos, SA', 'Kwanza Logística Portuária, Lda']) expect(screen.getByText(g)).toBeInTheDocument()
  })
  it('contas: 3 empresas × 3 utilizadores com funções diferentes', async () => {
    await open('/entrar')
    await screen.findByText('Contas de teste')
    for (const [n, role] of [['Paulo Ferreira', 'Administrador da empresa'], ['Ana Baptista', 'Inspectora'], ['Joana Pires', 'Auditora'], ['Rui Cardoso', 'Administrador da empresa'], ['Carlos Neto', 'Comprador'], ['Marta Gomes', 'Compras e qualificação'], ['Elias Tavares', 'Administrador da empresa'], ['Luzia Costa', 'Inspectora'], ['Hélder Quintas', 'Responsável documental']]) {
      const b = screen.getByText(n).closest('button') as HTMLElement; expect(within(b).getByText(role)).toBeInTheDocument()
    }
  })
  it('rota protegida redirecciona; depois do login volta à página pedida', async () => {
    await open('/app/documentos')
    await heading('Bem-vindo(a)!')
    fireEvent.click(screen.getByText('Paulo Ferreira').closest('button') as HTMLElement)
    await heading('Documentos')
  })
  it('registo valida os campos', async () => {
    await open('/registar')
    fireEvent.click(await screen.findByRole('button', { name: /Criar conta e empresa/ }))
    expect(await screen.findByText('Indique o seu nome')).toBeInTheDocument()
    expect(screen.getByText(/NIF inválido/)).toBeInTheDocument()
  })
  it('directório: público vazio (visibilidade «plataforma»); autenticado vê fornecedores', async () => {
    await open('/fornecedores-publico')
    expect(await screen.findByText('Nenhum fornecedor encontrado')).toBeInTheDocument()
    cleanup()
    await open('/app/fornecedores', ACC.rui)
    expect(await screen.findByText('Atlântico Inspecções')).toBeInTheDocument()
    expect(screen.getByText('Kwanza Portuária')).toBeInTheDocument()
  })
})

describe('mapas de inspecção (fluxo completo)', () => {
  let mapPath = ''
  it('inspectora cria, preenche (cálculos automáticos), guarda e submete', async () => {
    await open('/app/inspeccoes', ACC.ana)
    await heading('Mapas de inspecção')
    fireEvent.click(await screen.findByRole('button', { name: /Novo mapa/ }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.change(within(dlg).getByLabelText(/^Título/), { target: { value: 'Descarga de arroz — porão 2' } })
    fireEvent.change(within(dlg).getByLabelText(/^Navio/), { target: { value: 'MV Exemplo' } })
    fireEvent.click(within(dlg).getByRole('button', { name: /Criar e preencher/ }))
    await heading('Descarga de arroz — porão 2')
    fireEvent.click(screen.getByRole('button', { name: /Adicionar linha/ }))
    const l1 = screen.getByRole('article', { name: 'Linha 1' })
    fireEvent.change(field(l1, /^Mercadoria/), { target: { value: 'Sacos de arroz 50 kg' } })
    fireEvent.change(field(l1, /^Declarada/), { target: { value: '1000' } })
    fireEvent.change(field(l1, /^Contada/), { target: { value: '987.5' } })
    fireEvent.change(field(l1, /^Avariada/), { target: { value: '12.5' } })
    fireEvent.change(field(l1, /Peso unit/), { target: { value: '50' } })
    const calc = within(l1).getByLabelText('Cálculos da linha 1')
    expect(calc).toHaveTextContent(/-12,500/); expect(calc).toHaveTextContent(/-1,25\s%/); expect(calc).toHaveTextContent(/48\s750,000\skg/); expect(calc).toHaveTextContent('Fora (0.5 %)')
    // as unidades não se misturam nos totais
    expect(screen.getByText('Totais por unidade')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
    await waitFor(() => expect(screen.getByText('Mapa guardado.')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Submeter para revisão/ }))
    fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Submeter' }))
    expect(await screen.findByText('Submetido para revisão')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument() // a inspectora não aprova
    expect(screen.queryByRole('button', { name: /Adicionar linha/ })).not.toBeInTheDocument() // mapa submetido é só de leitura
    mapPath = '/app/inspeccoes/' + (await screen.findByRole('link', { name: 'Relatório' })).getAttribute('href')!.split('/')[3]
  })
  it('outra empresa não vê o mapa; auditora vê mas não cria', async () => {
    await open('/app/inspeccoes', ACC.rui)
    await heading('Mapas de inspecção')
    expect(await screen.findByText('Ainda sem mapas')).toBeInTheDocument()
    cleanup()
    await open('/app/inspeccoes', ACC.joana)
    expect(await screen.findByText('Descarga de arroz — porão 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Novo mapa/ })).not.toBeInTheDocument()
  })
  it('administrador (outra pessoa) aprova; mapa aprovado fica imutável e tem relatório', async () => {
    await open(mapPath, ACC.paulo)
    await heading('Descarga de arroz — porão 2')
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }))
    fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Mapa aprovado')).toBeInTheDocument()
    cleanup()
    await open(mapPath + '/relatorio', ACC.paulo)
    expect(await screen.findByText('Mapa de controlo de mercadorias')).toBeInTheDocument()
    expect(screen.getByText('Totais por unidade')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Imprimir/ })).toBeInTheDocument()
  })
  it('ninguém aprova o mapa que preencheu', async () => {
    await open('/app/inspeccoes', ACC.paulo)
    fireEvent.click(await screen.findByRole('button', { name: /Novo mapa/ }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.change(within(dlg).getByLabelText(/^Título/), { target: { value: 'Mapa do administrador' } })
    fireEvent.click(within(dlg).getByRole('button', { name: /Criar e preencher/ }))
    await heading('Mapa do administrador')
    fireEvent.click(screen.getByRole('button', { name: /Adicionar linha/ }))
    fireEvent.change(field(screen.getByRole('article', { name: 'Linha 1' }), /^Mercadoria/), { target: { value: 'Trigo a granel' } })
    fireEvent.click(screen.getByRole('button', { name: /Submeter para revisão/ }))
    fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Submeter' }))
    expect(await screen.findByText(/Não pode aprovar um mapa que preencheu ou submeteu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
  })
  it('permissões por função', async () => {
    await open('/app/inspeccoes', ACC.helder); expect(await screen.findByText('Sem permissão')).toBeInTheDocument(); cleanup()
    await open('/app/smart-hold-scan', ACC.carlos); expect(await screen.findByText('Sem permissão')).toBeInTheDocument(); cleanup()
    await open('/app', ACC.ana); await heading('Dashboard'); expect(await screen.findByText('Em preenchimento')).toBeInTheDocument()
  })
})

describe('JOVEM+ SMART HOLD SCAN', () => {
  it('sensores: LiDAR não é detectável no navegador e o aviso de não validado está sempre visível', async () => {
    await open('/app/smart-hold-scan', ACC.ana)
    await heading('JOVEM+ SMART HOLD SCAN')
    expect(screen.getByText(/Protótipo — medições indicativas, não validadas/)).toBeInTheDocument()
    expect(await screen.findByText('Sensores e capacidades')).toBeInTheDocument()
    expect(screen.getByText('Não detectável no navegador')).toBeInTheDocument()
    expect(screen.getByText(/Modelo importado/)).toBeInTheDocument()
  })
  it('espaço de teste simulado: reconstrói, estima dimensões e marca tudo como indicativo/simulado', async () => {
    await open('/app/smart-hold-scan', ACC.ana)
    fireEvent.click(await screen.findByRole('tab', { name: 'Digitalizar' }))
    fireEvent.click(await screen.findByRole('button', { name: /Gerar e visualizar/ }))
    expect(await screen.findByText('Indicativo — não validado', {}, { timeout: 15000 })).toBeInTheDocument()
    expect(screen.getAllByText(/SIMULADO/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Estimar dimensões/ }))
    expect(await screen.findByText(/pares de planos paralelos/, {}, { timeout: 20000 })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Comparação com o espaço simulado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PLY' })).toBeInTheDocument()
  }, 40000)
  it('validação: sem registos nada é validado; um registo gera «incompleta» e erro calculado', async () => {
    await open('/app/smart-hold-scan', ACC.ana)
    fireEvent.click(await screen.findByRole('tab', { name: /Validação de precisão/ }))
    expect(await screen.findByText('Sem validação')).toBeInTheDocument()
    expect(await screen.findByText(/Critérios mínimos \(provisórios/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Dimensão medida/), { target: { value: 'Largura do espaço' } })
    fireEvent.change(screen.getByLabelText(/^Valor físico/), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText(/^Valor digitalizado/), { target: { value: '4.03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registar medição' }))
    expect(await screen.findByText('Largura do espaço')).toBeInTheDocument()
    expect(await screen.findByText(/\+0,030\sm\s\(0,75\s%\)/)).toBeInTheDocument()
    expect(screen.getByText('Validação incompleta')).toBeInTheDocument()
    expect(screen.queryByText(/Cumpre critérios/)).not.toBeInTheDocument()
  })
  it('a validação da empresa 1 é invisível para a empresa 3 (mesmo método)', async () => {
    await open('/app/smart-hold-scan', ACC.luzia)
    fireEvent.click(await screen.findByRole('tab', { name: /Validação de precisão/ }))
    expect(await screen.findByText('Sem validação')).toBeInTheDocument()
    expect(screen.queryByText('Largura do espaço')).not.toBeInTheDocument()
  })
})

describe('administração e navegação', () => {
  it('superadministradora vê as 3 empresas e a navegação nova', async () => {
    await open('/app/admin/organizacoes', ACC.admin)
    await heading('Organizações')
    for (const n of ['Atlântico Inspecções', 'Porto Grãos', 'Kwanza Portuária']) expect(await screen.findByText(n)).toBeInTheDocument()
  })
  it('equipa: administrador atribui a função de inspector', async () => {
    await open('/app/equipa', ACC.paulo)
    await heading('Equipa e funções')
    expect(await screen.findByText('Ana Baptista')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Atribuir função/ }))
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).getByRole('option', { name: 'Inspector' })).toBeInTheDocument()
  })
  it('módulos: lista os módulos disponíveis', async () => {
    await open('/app/modulos', ACC.ana)
    await heading('Módulos JOVEM+ BUSINESS')
    expect(screen.getByText('JOVEM+ SMART HOLD SCAN')).toBeInTheDocument()
  })
})

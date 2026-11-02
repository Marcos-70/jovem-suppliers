import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './components/ui'
import { AuthProvider } from './hooks/useAuth'
import { MISSING_CONFIG } from './lib/env'
import './index.css'

// A versão publicada como página hospedada usa navegação em memória (o endereço do visualizador não segue as rotas).
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } })

function ConfigMissing() {
  return (
    <main style={{ maxWidth: 560, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#0A1E45' }}>
      <h1 style={{ fontSize: 24 }}>Configuração em falta</h1>
      <p>Esta instalação ainda não está ligada à base de dados. Defina as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no alojamento e volte a publicar (ver <code>docs/PUBLICAR.md</code>).</p>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  MISSING_CONFIG ? <ConfigMissing /> : (
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <Router>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </Router>
    </QueryClientProvider>
  </React.StrictMode>),
)

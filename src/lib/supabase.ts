import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IS_DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { createDemoClient } from './demo/client'

/**
 * Cliente único da aplicação. Em produção é o cliente Supabase (a segurança real
 * está nas políticas RLS e funções do servidor). Em DEMONSTRAÇÃO é um substituto
 * em memória que NÃO persiste dados nem aplica isolamento real.
 */
export const db: SupabaseClient = IS_DEMO
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })

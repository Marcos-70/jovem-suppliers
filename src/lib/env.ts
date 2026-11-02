const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const force = import.meta.env.VITE_FORCE_DEMO === 'true'

export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = key
/** Sem Supabase configurado (ou forçado), a aplicação corre em modo DEMONSTRAÇÃO. */
export const IS_DEMO = force || !url || !key

/**
 * Em produção, sem Supabase configurado (e sem forçar o modo de pré-visualização), a aplicação NÃO arranca com dados
 * de teste: mostra um ecrã de configuração em falta. Evita publicar por engano uma versão sem base de dados.
 */
export const MISSING_CONFIG = import.meta.env.PROD && !force && (!url || !key)

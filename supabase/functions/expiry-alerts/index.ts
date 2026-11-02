// Edge Function agendada: gera alertas de validade de documentos e de prazos de pedidos.
// NÃO TESTADA neste ambiente (requer projecto Supabase). A lógica está em public.generate_alerts(),
// que está testada em supabase/tests/sql. Alternativa sem função: pg_cron (ver README).
//
// Configuração:  supabase secrets set CRON_SECRET=<segredo longo e aleatório>
// Agendar (Dashboard → Edge Functions → Schedule) com o cabeçalho  Authorization: Bearer <CRON_SECRET>
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('forbidden', { status: 403 })
  }
  // A service_role key é injectada pelo Supabase na função; nunca vai para o frontend.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await sb.rpc('generate_alerts')
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ ok: true, ...data }), { headers: { 'content-type': 'application/json' } })
})

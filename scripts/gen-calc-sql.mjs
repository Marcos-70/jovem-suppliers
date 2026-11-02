// Gera testes SQL a partir dos vectores de cálculo partilhados com os testes TypeScript.
import { readFileSync } from 'node:fs'
const v = JSON.parse(readFileSync(new URL('../supabase/tests/calc_vectors.json', import.meta.url)))
const lines = ['-- GERADO por scripts/gen-calc-sql.mjs — não editar.']
v.forEach((c, i) => {
  lines.push(`do $$ declare r record; begin
  select * into r from public.calc_line(${c.quantity}, ${c.unitPrice}, ${c.discountPct}, ${c.taxPct});
  if r.gross <> ${c.gross} or r.discount <> ${c.discount} or r.subtotal <> ${c.subtotal} or r.tax <> ${c.tax} or r.total <> ${c.total} then
    raise exception 'FALHOU vector ${i + 1}: SQL devolveu % % % % %', r.gross, r.discount, r.subtotal, r.tax, r.total;
  end if; raise notice 'ok - paridade SQL/vector ${i + 1}';
end $$;`)
})
console.log(lines.join('\n'))

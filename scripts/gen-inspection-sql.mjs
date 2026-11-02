// Gera testes SQL (colunas calculadas das linhas de inspecção) a partir dos vectores partilhados com o TypeScript.
import { readFileSync } from 'node:fs'
const v = JSON.parse(readFileSync(new URL('../supabase/tests/inspection_vectors.json', import.meta.url)))
const n = (x) => (x === null ? 'null' : x)
const out = ['-- GERADO por scripts/gen-inspection-sql.mjs — não editar.', `do $$ declare m uuid; r record; o uuid; begin
  select id into o from public.organizations where nif = '5000000001';
  insert into public.inspection_maps (organization_id, title) values (o, 'Paridade de cálculo') returning id into m;`]
v.forEach((c, i) => out.push(`  insert into public.inspection_map_lines (map_id, position, item_description, declared_qty, counted_qty, damaged_qty, unit_weight_kg) values (m, ${i + 1}, 'v${i + 1}', ${c.declared}, ${c.counted}, ${c.damaged}, ${n(c.unitWeight)});
  select * into r from public.inspection_map_lines where map_id = m and position = ${i + 1};
  if r.diff_qty <> ${c.diff} or r.good_qty <> ${c.good} or r.diff_pct is distinct from ${n(c.diffPct)}::numeric or r.line_weight_kg is distinct from ${n(c.weightKg)}::numeric then
    raise exception 'FALHOU vector inspecção ${i + 1}: % % % %', r.diff_qty, r.good_qty, r.diff_pct, r.line_weight_kg; end if;
  raise notice 'ok - paridade inspecção ${i + 1}';`))
out.push('  delete from public.inspection_map_lines where map_id = m; delete from public.inspection_maps where id = m;\nend $$;')
console.log(out.join('\n'))

-- Mapas de inspecção e SMART HOLD SCAN: isolamento, papéis, segregação de funções e imutabilidade.
do $$
declare
  u_s1 uuid := '00000000-0000-0000-0000-0000000000a1'; u_s2 uuid := '00000000-0000-0000-0000-0000000000a2';
  u_i uuid := '00000000-0000-0000-0000-0000000000e1'; u_aud uuid := '00000000-0000-0000-0000-0000000000e2';
  o_s1 uuid; o_s2 uuid; m uuid; l uuid; sc uuid;
begin
  perform t.as_admin();
  insert into auth.users (id, email, raw_user_meta_data) values (u_i, 'insp@x.ao', '{"full_name":"Inspector"}'), (u_aud, 'aud@x.ao', '{"full_name":"Auditor"}');
  select id into o_s1 from public.organizations where nif = '5000000001';
  select id into o_s2 from public.organizations where nif = '5000000002';

  perform t.as_user(u_s1);
  perform public.add_member(o_s1, 'insp@x.ao', 'inspector');
  perform public.add_member(o_s1, 'aud@x.ao', 'auditor');
  perform t.ok(true, 'administrador atribui as funções inspector e auditor');

  -- inspector cria e preenche
  perform t.as_user(u_i);
  insert into public.inspection_maps (organization_id, title, vessel_name, tolerance_pct, created_by, inspector_id)
    values (o_s1, 'Descarga de trigo — porão 2', 'MV Teste', 0.5, u_i, u_i) returning id into m;
  perform t.throws(format($q$insert into public.inspection_maps (organization_id, title, created_by) values (%L, 'Intruso', %L)$q$, o_s2, u_i), 'row-level security', 'inspector não cria mapas noutra organização');
  insert into public.inspection_map_lines (map_id, position, item_description, unit, declared_qty, counted_qty, damaged_qty, unit_weight_kg)
    values (m, 1, 'Sacos de arroz 50 kg', 'un', 1000, 987.5, 12.5, 50) returning id into l;
  perform t.ok((select diff_qty from public.inspection_map_lines where id = l) = -12.5, 'diferença calculada no servidor');
  perform t.ok((select diff_pct from public.inspection_map_lines where id = l) = -1.25, 'percentagem calculada no servidor');
  perform t.ok((select line_weight_kg from public.inspection_map_lines where id = l) = 48750.000, 'peso líquido calculado no servidor');
  perform t.throws(format($q$update public.inspection_map_lines set diff_qty = 0 where id = %L$q$, l), 'permission denied|generated|only be updated to DEFAULT', 'cliente não escreve colunas calculadas');
  perform t.throws(format($q$insert into public.inspection_map_lines (map_id, position, item_description, counted_qty, damaged_qty) values (%L, 2, 'xx', 1, 5)$q$, m), 'inspection_map_lines_check', 'avariadas não excedem contadas');
  perform t.throws(format($q$update public.inspection_maps set status = 'approved' where id = %L$q$, m), 'permission denied', 'inspector não altera o estado directamente');
  perform t.throws(format($q$select public.review_inspection_map(%L, 'approved')$q$, m), 'PERMISSION_DENIED', 'inspector não aprova mapas');

  -- isolamento
  perform t.as_user(u_s2);
  perform t.ok(t.count('select 1 from public.inspection_maps') = 0, 'outra organização não vê mapas');
  perform t.ok(t.count('select 1 from public.inspection_map_lines') = 0, 'nem linhas');
  perform t.as_user(u_aud);
  perform t.ok(t.count('select 1 from public.inspection_maps') = 1, 'auditor consulta mapas da sua organização');
  perform t.throws(format($q$insert into public.inspection_maps (organization_id, title, created_by) values (%L, 'Auditor a criar', %L)$q$, o_s1, u_aud), 'row-level security', 'auditor não cria mapas');

  -- submissão e segregação de funções
  perform t.as_user(u_i);
  perform public.submit_inspection_map(m);
  perform t.ok((select status from public.inspection_maps where id = m) = 'submitted', 'mapa submetido');
  update public.inspection_map_lines set counted_qty = 1 where id = l;
  perform t.as_admin();
  perform t.ok((select counted_qty from public.inspection_map_lines where id = l) = 987.5, 'mapa submetido deixa de ser editável pelo inspector');
  perform t.as_user(u_s1);
  perform t.throws(format($q$select public.review_inspection_map(%L, 'returned')$q$, m), 'REASON_REQUIRED', 'devolução exige motivo');
  perform public.review_inspection_map(m, 'returned', 'Confirmar contagem do porão 2.');
  perform t.as_user(u_i);
  update public.inspection_map_lines set counted_qty = 990, damaged_qty = 10 where id = l;
  perform t.ok((select counted_qty from public.inspection_map_lines where id = l) = 990, 'mapa devolvido volta a ser editável');
  perform public.submit_inspection_map(m);
  perform t.ok(t.count('select 1 from public.notifications where type = ''inspection_returned''') = 1, 'inspector foi notificado da devolução');
  -- o administrador também é inspector num segundo mapa e não pode aprovar o próprio
  perform t.as_user(u_s1);
  insert into public.inspection_maps (organization_id, title, created_by, inspector_id) values (o_s1, 'Mapa do administrador', u_s1, u_s1) returning id into sc;
  insert into public.inspection_map_lines (map_id, position, item_description) values (sc, 1, 'xx');
  perform public.submit_inspection_map(sc);
  perform t.throws(format($q$select public.review_inspection_map(%L, 'approved')$q$, sc), 'CANNOT_REVIEW_OWN_MAP', 'ninguém aprova o próprio mapa');
  perform public.review_inspection_map(m, 'approved');
  perform t.ok((select status from public.inspection_maps where id = m) = 'approved', 'outro responsável aprova o mapa');
  perform t.as_user(u_i);
  delete from public.inspection_map_lines where map_id = m;
  perform t.as_admin();
  perform t.ok((select count(*) from public.inspection_map_lines where map_id = m) = 1, 'mapa aprovado é imutável');
  perform t.ok((select count(*) from public.audit_logs where entity_type = 'inspection_maps') > 0, 'alterações a mapas ficam em auditoria');

  -- digitalizações e validações
  perform t.as_user(u_i);
  insert into public.hold_scans (organization_id, inspection_map_id, title, method, device, created_by) values (o_s1, m, 'Teste do espaço', 'imported_model', '{"modelo":"x"}', u_i) returning id into sc;
  insert into public.scan_validations (organization_id, scan_id, device_label, method, reference_label, physical_value, scanned_value, measured_by)
    values (o_s1, sc, 'Telemóvel X', 'imported_model', 'Largura', 4.000, 4.032, u_i);
  perform t.ok((select error_pct from public.scan_validations limit 1) = 0.800, 'erro percentual da validação calculado no servidor');
  perform t.throws(format($q$insert into public.scan_validations (organization_id, device_label, method, reference_label, physical_value, scanned_value, measured_by) values (%L, 'X', 'manual', 'Y', 1, 1, %L)$q$, o_s1, u_aud), 'row-level security', 'não se regista validação em nome de outra pessoa');
  perform t.throws('update public.scan_validations set scanned_value = 4.0', 'permission denied', 'validações não se alteram');
  perform t.throws('delete from public.scan_validations', 'permission denied', 'validações não se apagam');
  perform t.as_user(u_s2);
  perform t.ok(t.count('select 1 from public.hold_scans') + t.count('select 1 from public.scan_validations') = 0, 'outra organização não vê digitalizações nem validações');
  perform t.throws(format($q$insert into storage.objects (bucket_id, name) values ('scans', %L)$q$, o_s1 || '/x/modelo.ply'), 'row-level security', 'outra organização não escreve no armazenamento de modelos');
  perform t.as_user(u_i);
  insert into storage.objects (bucket_id, name) values ('scans', o_s1 || '/' || sc || '/modelo.ply');
  perform t.ok(true, 'inspector escreve o modelo na pasta da sua organização');
  perform t.as_admin();
end $$;

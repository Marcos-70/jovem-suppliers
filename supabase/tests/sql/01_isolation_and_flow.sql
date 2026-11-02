-- Testes de integração: isolamento entre organizações, autorização, prazos,
-- propostas seladas, cálculos, alertas e imutabilidade. Cada verificação
-- imprime "ok - ..." ou aborta com "FALHOU".
create schema t;
grant usage on schema t to public;
create table t.ctx (k text primary key, v text);
grant select on t.ctx to public;

create function t.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;
create function t.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function t.throws(q text, pat text, msg text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute q; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'FALHOU (não lançou erro): %', msg; end if;
  if v_err !~* pat then raise exception 'FALHOU: % — erro inesperado: %', msg, v_err; end if;
  raise notice 'ok - %', msg;
end $$;
create function t.count(q text) returns int language plpgsql as $$
declare n int;
begin execute 'select count(*)::int from (' || q || ') x' into n; return n; end $$;

do $$
declare
  u_sa uuid := '00000000-0000-0000-0000-0000000000a0';
  u_s1 uuid := '00000000-0000-0000-0000-0000000000a1';
  u_s2 uuid := '00000000-0000-0000-0000-0000000000a2';
  u_b1 uuid := '00000000-0000-0000-0000-0000000000b1';
  u_b2 uuid := '00000000-0000-0000-0000-0000000000b2';
  u_q1 uuid := '00000000-0000-0000-0000-0000000000c1';
  u_bb uuid := '00000000-0000-0000-0000-0000000000c2';
  u_out uuid := '00000000-0000-0000-0000-0000000000d0';
  o_s1 uuid; o_s2 uuid; o_b1 uuid; o_b2 uuid;
  v_cat uuid; v_type uuid; v_doc uuid; v_opp uuid; v_item1 uuid; v_item2 uuid; v_prop uuid;
  v_path text; v_n int; v_total numeric; v_status text; v_snap jsonb; v_before int;
begin
  -- ----------------------------------------------------------- preparação
  insert into auth.users (id, email, raw_user_meta_data) values
    (u_sa, 'sa@x.ao', '{"full_name":"Super"}'), (u_s1, 's1@x.ao', '{"full_name":"Forn 1"}'),
    (u_s2, 's2@x.ao', '{"full_name":"Forn 2"}'), (u_b1, 'b1@x.ao', '{"full_name":"Comp 1"}'),
    (u_b2, 'b2@x.ao', '{"full_name":"Comp 2"}'), (u_q1, 'q1@x.ao', '{"full_name":"Qualif 1"}'),
    (u_bb, 'bb@x.ao', '{"full_name":"Buyer sem decisao"}'), (u_out, 'out@x.ao', '{"full_name":"Outsider"}');
  perform public.bootstrap_superadmin('sa@x.ao');
  select id into v_cat from public.categories where slug = 'manutencao-industrial';
  select id into v_type from public.document_types where code = 'commercial_registry';

  perform t.as_user(u_s1);
  o_s1 := public.create_organization('Fornecedor Um, Lda', 'Forn1', '5000000001', 'supplier', 'Manutenção', 'Luanda', 'Belas', 's1@x.ao', '900000001');
  perform t.as_user(u_s2);
  o_s2 := public.create_organization('Fornecedor Dois, Lda', 'Forn2', '5000000002', 'supplier', 'Manutenção', 'Benguela', 'Lobito', 's2@x.ao', '900000002');
  perform t.as_user(u_b1);
  o_b1 := public.create_organization('Petrolifera Um, SA', 'Petro1', '5000000003', 'buyer', 'Petróleo', 'Luanda', 'Luanda', 'b1@x.ao', '900000003');
  perform t.as_user(u_b2);
  o_b2 := public.create_organization('Petrolifera Dois, SA', 'Petro2', '5000000004', 'buyer', 'Petróleo', 'Cabinda', 'Cabinda', 'b2@x.ao', '900000004');
  perform t.as_user(u_b1);
  perform public.add_member(o_b1, 'q1@x.ao', 'procurement_qualifier');
  perform public.add_member(o_b1, 'bb@x.ao', 'buyer');
  perform t.ok(true, 'organizações criadas e membros adicionados via RPC');
  perform t.throws($q$select public.create_organization('Duplicada', null, '5000000001', 'supplier', 'x', 'x', 'x', 'x@x.ao', '1')$q$,
    'NIF_ALREADY_REGISTERED', 'NIF duplicado é rejeitado');
  perform t.throws($q$select public.create_organization('Inválida', null, '123', 'supplier', 'x', 'x', 'x', 'x@x.ao', '1')$q$,
    'INVALID_NIF', 'NIF com formato inválido é rejeitado');

  perform t.as_admin();
  update public.organizations set profile_status = 'approved', address = 'Rua A', description = 'Descrição',
    contact_person = 'Pessoa' where id in (o_s1, o_s2, o_b1, o_b2);
  insert into public.services (organization_id, category_id, name, specialties)
    values (o_s1, v_cat, 'Manutenção de bombas', '{bombas}'), (o_s2, v_cat, 'Manutenção eléctrica', '{}');
  update public.organizations set visibility = 'public', public_fields = '{phone}' where id = o_s1;
  update public.organizations set visibility = 'platform' where id = o_s2;

  -- ------------------------------------------------- 1. directório e visibilidade
  perform t.as_anon();
  perform t.ok(t.count('select 1 from public.supplier_directory') = 1, 'anónimo só vê organizações públicas e aprovadas');
  perform t.ok((select phone from public.supplier_directory limit 1) = '900000001', 'campo autorizado (telefone) é visível');
  perform t.ok((select email from public.supplier_directory limit 1) is null, 'campo não autorizado (e-mail) é mascarado');
  perform t.ok((select nif from public.supplier_directory limit 1) is null, 'NIF não autorizado é mascarado');
  perform t.throws('select * from public.organizations', 'permission denied', 'anónimo não lê a tabela de organizações');
  perform t.throws('select * from public.documents', 'permission denied', 'anónimo não lê documentos');
  perform t.as_user(u_out);
  perform t.ok(t.count('select 1 from public.supplier_directory') = 2, 'utilizador autenticado vê organizações públicas e de plataforma');
  perform t.ok(t.count('select 1 from public.organizations') = 0, 'terceiros não lêem linhas completas de organizações');

  -- ---------------------------------------- 2. escalada de privilégios
  perform t.as_user(u_s1);
  perform t.throws($q$update public.profiles set is_superadmin = true where id = '00000000-0000-0000-0000-0000000000a1'$q$,
    'permission denied', 'utilizador não se torna superadministrador');
  perform t.throws(format($q$update public.organizations set profile_status = 'approved' where id = %L$q$, o_s1),
    'permission denied', 'organização não altera o próprio estado de aprovação');
  perform t.throws(format($q$update public.organizations set verification_status = 'verified' where id = %L$q$, o_s1),
    'permission denied', 'organização não se auto-verifica');
  perform t.throws(format($q$insert into public.organization_members (organization_id, user_id, role) values (%L, %L, 'org_admin')$q$, o_s2, u_s1),
    'permission denied', 'inserção directa de membros é negada');
  perform t.throws(format($q$select public.add_member(%L, 's1@x.ao', 'auditor')$q$, o_s1),
    'CANNOT_CHANGE_OWN_ROLES', 'administrador não atribui funções a si próprio');
  perform t.throws(format($q$select public.add_member(%L, 's1@x.ao', 'org_admin')$q$, o_s2),
    'PERMISSION_DENIED', 'não se gerem membros de outra organização');
  perform t.throws($q$insert into public.audit_logs (action) values ('falso')$q$, 'permission denied', 'auditoria não é escrita pelo cliente');
  perform t.throws($q$select public.bootstrap_superadmin('s1@x.ao')$q$, 'permission denied|PERMISSION_DENIED', 'bootstrap de superadmin é inacessível ao cliente');
  perform t.as_user(u_s2);
  perform t.ok(t.count(format('select 1 from public.organizations where id = %L', o_s1)) = 0, 'fornecedor 2 não lê a organização do fornecedor 1');
  update public.organizations set trade_name = 'Hack' where id = o_s1;
  perform t.as_admin();
  perform t.ok((select trade_name from public.organizations where id = o_s1) = 'Forn1', 'UPDATE a outra organização não tem efeito');

  -- ------------------------------------------------------------ 3. documentos
  perform t.as_user(u_s1);
  v_path := o_s1 || '/' || gen_random_uuid() || '/registo.pdf';
  v_doc := public.upload_document(o_s1, v_type, 'Registo comercial', 'RC-1', null, null, v_path, 'registo.pdf', 1000, 'application/pdf');
  perform t.ok(v_doc is not null, 'fornecedor carrega documento da própria organização');
  perform t.throws(format($q$select public.upload_document(%L, %L, 'x', null, null, null, %L, 'x.pdf', 10, 'application/pdf')$q$, o_s2, v_type, o_s2 || '/a/x.pdf'),
    'PERMISSION_DENIED', 'fornecedor não carrega documentos noutra organização');
  perform t.throws(format($q$select public.upload_document(%L, %L, 'x', null, null, null, %L, 'x.exe', 10, 'application/x-msdownload')$q$, o_s1, v_type, o_s1 || '/a/x.exe'),
    'INVALID_FILE_TYPE', 'tipo de ficheiro inválido é rejeitado');
  perform t.throws(format($q$select public.upload_document(%L, %L, 'x', null, null, null, %L, 'x.pdf', 99999999, 'application/pdf')$q$, o_s1, v_type, o_s1 || '/a/x.pdf'),
    'FILE_TOO_LARGE', 'ficheiro acima do limite é rejeitado');
  perform t.throws(format($q$select public.upload_document(%L, %L, 'x', null, null, null, %L, 'x.pdf', 10, 'application/pdf')$q$, o_s1, v_type, o_s2 || '/a/x.pdf'),
    'INVALID_STORAGE_PATH', 'caminho de armazenamento de outra organização é rejeitado');
  perform t.ok(t.count('select 1 from public.documents') = 1, 'fornecedor 1 vê o seu documento');
  perform t.throws($q$update public.documents set status = 'approved'$q$, 'permission denied', 'fornecedor não aprova os próprios documentos');
  perform t.throws(format($q$select public.review_document(%L, 'approved')$q$, v_doc), 'PERMISSION_DENIED', 'só o superadministrador analisa documentos');
  perform t.as_user(u_s2);
  perform t.ok(t.count('select 1 from public.documents') = 0, 'fornecedor 2 não vê documentos do fornecedor 1');
  perform t.ok(t.count(format('select 1 from public.documents where id = %L', v_doc)) = 0, 'alterar o ID não contorna a permissão');
  perform t.throws(format($q$insert into storage.objects (bucket_id, name) values ('documents', %L)$q$, o_s1 || '/x/y.pdf'),
    'row-level security', 'fornecedor 2 não escreve na pasta de armazenamento do fornecedor 1');
  perform t.as_user(u_s1);
  insert into storage.objects (bucket_id, name) values ('documents', o_s1 || '/' || gen_random_uuid() || '/ok.pdf');
  perform t.ok(true, 'fornecedor 1 escreve na sua pasta de armazenamento');

  perform t.as_user(u_sa);
  perform public.start_document_review(v_doc);
  perform t.throws(format($q$select public.review_document(%L, 'rejected')$q$, v_doc), 'REASON_REQUIRED', 'rejeição exige motivo');
  perform public.review_document(v_doc, 'approved');
  perform t.ok((select status from public.documents where id = v_doc) = 'approved', 'superadministrador aprova e fica registado');
  perform t.ok(t.count(format('select 1 from public.document_reviews where document_id = %L', v_doc)) = 1, 'análise ficou registada');
  perform t.as_admin();
  insert into storage.objects (bucket_id, name) values ('documents', v_path);

  -- ----------------------------------------------- 4. pedidos e convites
  perform t.as_user(u_b1);
  insert into public.opportunities (buyer_org_id, title, deadline, currency, created_by)
    values (o_b1, 'Manutenção de bombas', now() + interval '7 days', 'AOA', u_b1) returning id into v_opp;
  insert into public.opportunity_items (opportunity_id, position, description, quantity, unit)
    values (v_opp, 1, 'Selo mecânico', 3, 'un') returning id into v_item1;
  insert into public.opportunity_items (opportunity_id, position, description, quantity, unit)
    values (v_opp, 2, 'Mão-de-obra', 10.5, 'h') returning id into v_item2;
  perform t.throws(format($q$insert into public.opportunities (buyer_org_id, title, deadline, created_by) values (%L, 'Intruso', now() + interval '1 day', %L)$q$, o_b2, u_b1),
    'row-level security', 'comprador não cria pedidos em nome de outra empresa');
  perform t.throws(format($q$update public.opportunities set status = 'awarded' where id = %L$q$, v_opp), 'permission denied', 'estado do pedido não é alterado directamente');
  perform t.as_user(u_s1);
  perform t.ok(t.count(format('select 1 from public.opportunities where id = %L', v_opp)) = 0, 'rascunho não é visível a fornecedores');
  perform t.as_user(u_b1);
  perform t.throws(format($q$select public.publish_opportunity(%L, '{}', true)$q$, v_opp), 'INVITEES_REQUIRED', 'pedido por convite exige convidados');
  perform t.throws(format($q$select public.publish_opportunity(%L, array[%L::uuid], true)$q$, v_opp, o_b2), 'SUPPLIER_NOT_ELIGIBLE', 'só fornecedores elegíveis são convidados');
  perform public.publish_opportunity(v_opp, array[o_s1], true);
  perform t.ok((select status from public.opportunities where id = v_opp) = 'open', 'pedido publicado e aberto');
  perform t.as_user(u_b2);
  perform t.ok(t.count('select 1 from public.opportunities') = 0, 'comprador 2 não vê pedidos do comprador 1');
  perform t.as_user(u_s2);
  perform t.ok(t.count('select 1 from public.opportunities') = 0, 'fornecedor não convidado não vê o pedido');
  perform t.ok(t.count('select 1 from public.opportunity_items') = 0, 'fornecedor não convidado não vê os itens');
  perform t.as_user(u_s1);
  perform t.ok(t.count(format('select 1 from public.opportunities where id = %L', v_opp)) = 1, 'fornecedor convidado vê o pedido');
  perform t.ok(t.count('select 1 from public.notifications where type = ''invitation''') = 1, 'convite gerou notificação');
  perform t.as_user(u_s2);
  perform t.throws(format($q$select public.save_proposal(%L, %L, '{}', false)$q$, o_s2, v_opp), 'PERMISSION_DENIED', 'fornecedor não convidado não submete proposta');

  -- ---------------------------------------------------- 5. propostas e cálculo
  perform t.as_user(u_s1);
  v_prop := public.save_proposal(o_s1, v_opp, jsonb_build_object(
    'validity_until', (current_date + 30)::text, 'delivery_days', 15, 'currency', 'AOA',
    'items', jsonb_build_array(
      jsonb_build_object('opportunity_item_id', v_item1, 'unit_price', 1234.56, 'discount_pct', 10, 'tax_pct', 14),
      jsonb_build_object('opportunity_item_id', v_item2, 'unit_price', 5000, 'discount_pct', 0, 'tax_pct', 14))), true);
  select total into v_total from public.proposals where id = v_prop;
  -- Item 1: 3703.68 − 370.37 = 3333.31 + 466.66 = 3799.97 | Item 2: 52500.00 + 7350.00 = 59850.00
  perform t.ok(v_total = 63649.97, 'total da proposta calculado no servidor (63649.97)');
  perform t.ok((select count(*) from public.proposal_versions where proposal_id = v_prop) = 1, 'versão 1 registada');
  perform t.throws(format($q$select public.save_proposal(%L, %L, jsonb_build_object('currency','USD'), true)$q$, o_s1, v_opp), 'CURRENCY_MISMATCH', 'moeda diferente da do pedido é rejeitada');
  perform t.throws(format($q$select public.save_proposal(%L, %L, jsonb_build_object('validity_until', (current_date+5)::text, 'items', '[]'::jsonb), true)$q$, o_s1, v_opp), 'ALL_ITEMS_REQUIRED', 'proposta tem de cobrir todos os itens');
  perform t.throws(format($q$select public.save_proposal(%L, %L, '{}', false)$q$, o_s1, v_opp), 'PROPOSAL_ALREADY_SUBMITTED', 'proposta submetida não é alterada em silêncio');
  perform t.throws($q$update public.proposals set total = 1$q$, 'permission denied', 'cliente não altera totais');
  perform t.ok((select notifications from (select count(*) notifications from public.notifications where type = 'proposal_receipt') n) = 1, 'confirmação de recepção notificada');

  -- selagem
  perform t.as_user(u_b1);
  perform t.ok(t.count('select 1 from public.proposals') = 0, 'proposta selada: comprador não a vê antes do fim do prazo');
  perform t.as_user(u_s2);
  perform t.ok(t.count('select 1 from public.proposals') = 0, 'fornecedor 2 não vê propostas do fornecedor 1');
  perform t.as_user(u_s1);
  perform t.ok(t.count('select 1 from public.proposals') = 1, 'fornecedor vê a sua proposta');

  -- prazos
  perform t.as_admin();
  update public.opportunities set deadline = now() - interval '2 hours' where id = v_opp;
  perform t.as_user(u_s1);
  perform t.throws(format($q$select public.save_proposal(%L, %L, jsonb_build_object('validity_until', (current_date+30)::text, 'items', '[]'::jsonb), true)$q$, o_s1, v_opp),
    'DEADLINE_PASSED', 'submissão fora do prazo é rejeitada');
  perform t.throws(format($q$select public.withdraw_proposal(%L)$q$, v_prop), 'DEADLINE_PASSED', 'retirada fora do prazo é rejeitada');
  perform t.as_user(u_b1);
  perform t.ok(t.count('select 1 from public.proposals') = 1, 'após o prazo o comprador vê a proposta selada');
  perform t.as_user(u_b2);
  perform t.ok(t.count('select 1 from public.proposals') = 0, 'comprador 2 nunca vê propostas do comprador 1');
  perform t.as_user(u_b1);
  perform t.throws(format($q$select public.extend_deadline(%L, now() + interval '1 day', null, 'x')$q$, v_opp), 'REASON_REQUIRED', 'extensão exige motivo');
  perform public.extend_deadline(v_opp, now() + interval '1 day', null, 'Pedido de mais tempo');
  perform t.as_user(u_s1);
  perform public.save_proposal(o_s1, v_opp, jsonb_build_object(
    'validity_until', (current_date + 30)::text, 'delivery_days', 10,
    'items', jsonb_build_array(
      jsonb_build_object('opportunity_item_id', v_item1, 'unit_price', 1000, 'tax_pct', 14),
      jsonb_build_object('opportunity_item_id', v_item2, 'unit_price', 4000, 'tax_pct', 14))), true);
  perform t.ok((select count(*) from public.proposal_versions where proposal_id = v_prop) = 2, 'revisão gera nova versão rastreável');
  select snapshot into v_snap from public.proposal_versions where proposal_id = v_prop and version = 1;
  perform t.ok((v_snap->'header'->>'total')::numeric = 63649.97, 'versão 1 mantém o valor original');
  perform t.as_admin();
  perform t.throws(format($q$update public.proposal_versions set total = 0 where proposal_id = %L$q$, v_prop), 'IMMUTABLE_RECORD', 'versões de proposta são imutáveis');
  update public.deadline_extensions set new_deadline = now() - interval '30 minutes' where opportunity_id = v_opp;

  -- ------------------------------------------------------------- 6. decisão
  perform t.as_user(u_bb);
  perform t.throws(format($q$select public.record_decision(%L, 'awarded', %L, 'Fundamento suficiente para a decisão')$q$, v_opp, v_prop),
    'PERMISSION_DENIED', 'comprador sem permissão de decisão não decide');
  perform t.as_user(u_b1);
  perform public.set_opportunity_status(v_opp, 'under_evaluation');
  perform t.ok((select status from public.proposals where id = v_prop) = 'in_evaluation', 'propostas passam a em avaliação');
  perform t.as_user(u_q1);
  perform t.throws(format($q$select public.record_decision(%L, 'awarded', %L, 'curto')$q$, v_opp, v_prop), 'RATIONALE_REQUIRED', 'decisão exige fundamento');
  perform public.record_decision(v_opp, 'awarded', v_prop, 'Melhor preço e cumprimento dos requisitos técnicos.');
  perform t.ok((select status from public.opportunities where id = v_opp) = 'awarded', 'pedido adjudicado');
  perform t.ok((select status from public.proposals where id = v_prop) = 'selected', 'proposta seleccionada');
  perform t.ok((select approved_amount from public.commercial_decisions where opportunity_id = v_opp) = (select total from public.proposals where id = v_prop), 'valor aprovado coincide com o total da proposta');
  perform t.throws(format($q$select public.record_decision(%L, 'no_award', null, 'Segunda decisão não permitida')$q$, v_opp), 'INVALID_STATE_TRANSITION|DECISION_ALREADY', 'não há segunda decisão');
  perform t.as_user(u_s1);
  perform t.ok(t.count('select 1 from public.commercial_decisions') = 0, 'fornecedor não lê o fundamento da decisão do comprador');
  perform t.ok(t.count('select 1 from public.notifications where type = ''decision''') = 1, 'fornecedor foi notificado da decisão');

  -- ------------------------------------- 7. acesso a documentos do fornecedor
  perform t.as_user(u_q1);
  perform t.ok(t.count('select 1 from public.documents') = 1, 'qualificador do comprador vê documentos aprovados de fornecedor que respondeu');
  perform t.ok(t.count('select 1 from storage.objects') >= 1, 'e pode ler o ficheiro correspondente');
  perform t.as_user(u_b2);
  perform t.ok(t.count('select 1 from public.documents') = 0, 'comprador sem relação não vê documentos');
  perform t.ok(t.count('select 1 from storage.objects') = 0, 'nem os ficheiros');
  perform t.as_user(u_bb);
  perform t.ok(t.count('select 1 from public.documents') = 0, 'função de comprador sem permissão documental não vê documentos');

  -- --------------------------------------------------------------- 8. alertas
  perform t.as_admin();
  update public.documents set valid_until = current_date + 5 where id = v_doc;
  perform public.generate_alerts();
  select count(*) into v_before from public.notifications where type = 'document_expiring';
  perform public.generate_alerts();
  perform t.ok(v_before = 1 and (select count(*) from public.notifications where type = 'document_expiring') = 1, 'alertas de validade não são duplicados');
  update public.documents set valid_until = current_date - 1 where id = v_doc;
  perform public.generate_alerts(); perform public.generate_alerts();
  perform t.ok((select count(*) from public.notifications where type = 'document_expired') = 1, 'alerta de expiração gerado uma só vez');

  -- -------------------------------------------------------------- 9. auditoria
  perform t.as_user(u_b1);
  perform t.ok(t.count('select 1 from public.audit_logs') > 0, 'administrador da empresa consulta a auditoria da sua organização');
  perform t.ok(t.count(format('select 1 from public.audit_logs where organization_id is distinct from %L', o_b1)) = 0, 'e só dessa organização');
  perform t.as_user(u_bb);
  perform t.ok(t.count('select 1 from public.audit_logs') = 0, 'sem permissão de auditoria não há acesso');
  perform t.as_user(u_s2);
  perform t.ok(t.count(format('select 1 from public.audit_logs where organization_id = %L', o_b1)) = 0, 'fornecedor 2 não vê auditoria de outras empresas');

  -- ---------------------------------------------------------- 10. limites
  perform t.as_user(u_out);
  perform public.create_organization('Org A', null, '6000000001', 'supplier', 'x', 'x', 'x', 'a@x.ao', '1');
  perform public.create_organization('Org B', null, '6000000002', 'supplier', 'x', 'x', 'x', 'a@x.ao', '1');
  perform public.create_organization('Org C', null, '6000000003', 'supplier', 'x', 'x', 'x', 'a@x.ao', '1');
  perform public.create_organization('Org D', null, '6000000004', 'supplier', 'x', 'x', 'x', 'a@x.ao', '1');
  perform public.create_organization('Org E', null, '6000000005', 'supplier', 'x', 'x', 'x', 'a@x.ao', '1');
  perform t.throws($q$select public.create_organization('Org F', null, '6000000006', 'supplier', 'x', 'x', 'x', 'a@x.ao', '1')$q$,
    'RATE_LIMIT_EXCEEDED', 'limite de pedidos abusivos é aplicado');
end $$;

-- Acesso a funções e documentos alheios (reutiliza utilizadores/organizações criados em 01).
do $$
declare
  u_s1 uuid := '00000000-0000-0000-0000-0000000000a1'; u_s2 uuid := '00000000-0000-0000-0000-0000000000a2';
  u_b2 uuid := '00000000-0000-0000-0000-0000000000b2'; u_bb uuid := '00000000-0000-0000-0000-0000000000c2';
  o_s1 uuid; o_s2 uuid; v_doc uuid; v_opp uuid; v_prop uuid;
begin
  perform t.as_admin();
  select id into o_s1 from public.organizations where nif = '5000000001';
  select id into o_s2 from public.organizations where nif = '5000000002';
  select id into v_doc from public.documents where organization_id = o_s1 limit 1;
  select id into v_opp from public.opportunities limit 1;
  select id into v_prop from public.proposals limit 1;

  perform t.as_anon();
  perform t.throws('select public.my_context()', 'permission denied', 'anónimo não executa my_context');
  perform t.throws(format($q$select public.request_document_access(%L)$q$, v_doc), 'permission denied', 'anónimo não pede acesso a documentos');
  perform t.throws('select public.generate_alerts()', 'permission denied', 'anónimo não gera alertas');

  perform t.as_user(u_s1);
  perform t.throws('select public.generate_alerts()', 'PERMISSION_DENIED', 'utilizador comum não gera alertas');
  perform t.throws($q$select public.admin_list_users()$q$, 'PERMISSION_DENIED', 'utilizador comum não lista utilizadores da plataforma');
  perform t.throws($q$select public.admin_opportunity_facts()$q$, 'PERMISSION_DENIED', 'factos globais só para superadministrador');
  perform t.throws(format($q$select public.set_verification(%L, 'verified', 'âmbito qualquer')$q$, o_s1), 'PERMISSION_DENIED', 'organização não se verifica a si própria');
  perform t.throws(format($q$select public.review_profile(%L, 'approved')$q$, o_s1), 'PERMISSION_DENIED', 'organização não aprova o próprio perfil');
  perform t.throws(format($q$select public.notify(%L, null, 'x', 'x', 'x', null, null)$q$, u_s1), 'permission denied', 'cliente não cria notificações');
  perform t.ok(public.request_document_access(v_doc) is not null, 'membro obtém acesso ao próprio documento');

  perform t.as_user(u_s2);
  perform t.throws(format($q$select public.request_document_access(%L)$q$, v_doc), 'PERMISSION_DENIED', 'fornecedor 2 não pede acesso a documento do fornecedor 1');
  perform t.throws(format($q$select public.add_attachment(%L, 'proposal', %L, %L, 'x.pdf', 10, 'application/pdf')$q$, o_s2, v_prop, o_s2 || '/proposal/x.pdf'), 'PERMISSION_DENIED', 'não se anexa a propostas de outros');
  perform t.throws(format($q$select public.withdraw_proposal(%L)$q$, v_prop), 'PERMISSION_DENIED', 'não se retira proposta alheia');
  perform t.throws(format($q$select public.ask_clarification(%L, %L, 'Pergunta indevida de não convidado')$q$, v_opp, o_s2), 'PERMISSION_DENIED', 'não convidado não faz perguntas');

  perform t.as_user(u_b2);
  perform t.throws(format($q$select public.set_opportunity_status(%L, 'cancelled', 'motivo qualquer')$q$, v_opp), 'PERMISSION_DENIED|NOT_FOUND', 'outro comprador não altera o estado do pedido');
  perform t.throws(format($q$select public.extend_deadline(%L, now() + interval '30 days', null, 'sem autorização')$q$, v_opp), 'PERMISSION_DENIED|NOT_FOUND', 'outro comprador não prorroga prazos');

  perform t.as_user(u_bb);
  perform t.throws(format($q$insert into public.evaluations (proposal_id, criterion_id, evaluator_id, score) values (%L, gen_random_uuid(), %L, 5)$q$, v_prop, u_bb), 'row-level security|violates foreign key', 'sem permissão de avaliar não grava avaliações');
  perform t.as_admin();
end $$;

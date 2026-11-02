-- =============================================================================
-- JOVEM+ SUPPLIERS — Migração 002: segurança (RLS, privilégios, armazenamento)
-- Princípio: menor privilégio. Tabelas com transições de estado sensíveis
-- (documentos, propostas, decisões, convites, membros) NÃO aceitam escrita
-- directa do cliente: a escrita passa por funções da migração 003.
-- =============================================================================

-- ------------------------------------------------------ Funções auxiliares
-- Todas SECURITY DEFINER para evitar recursão de RLS; todas com search_path fixo.
create or replace function public.safe_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_superadmin and p.is_active from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active
  )
$$;

create or replace function public.has_org_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organization_members m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active
      and rp.permission = p_perm
  )
$$;

create or replace function public.org_type_of(p_org uuid) returns public.org_type
language sql stable security definer set search_path = public as $$
  select org_type from public.organizations where id = p_org
$$;

create or replace function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members a
    join public.organization_members b on b.organization_id = a.organization_id
    where a.user_id = auth.uid() and a.is_active and b.user_id = p_user
  )
$$;

-- Prazo final: o maior entre o prazo original e qualquer extensão registada.
create or replace function public.final_deadline(p_opp uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(o.deadline, coalesce((select max(e.new_deadline) from public.deadline_extensions e
                                         where e.opportunity_id = o.id), o.deadline))
  from public.opportunities o where o.id = p_opp
$$;

-- Prazo efectivo para um fornecedor: extensões gerais (supplier_org_id nulo) ou dirigidas a ele.
create or replace function public.effective_deadline(p_opp uuid, p_supplier uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(o.deadline, coalesce((
    select max(e.new_deadline) from public.deadline_extensions e
    where e.opportunity_id = o.id and (e.supplier_org_id is null or e.supplier_org_id = p_supplier)
  ), o.deadline))
  from public.opportunities o where o.id = p_opp
$$;

create or replace function public.can_view_opportunity(p_opp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.opportunities o
    where o.id = p_opp and (
      public.has_org_permission(o.buyer_org_id, 'opportunity.view')
      or (o.status <> 'draft' and exists (
        select 1 from public.supplier_invitations i
        where i.opportunity_id = o.id and public.has_org_permission(i.supplier_org_id, 'opportunity.view')
      ))
      or (o.status in ('open', 'clarification') and o.visibility = 'open_to_qualified' and exists (
        select 1 from public.organization_members m
        join public.organizations s on s.id = m.organization_id
        join public.role_permissions rp on rp.role = m.role and rp.permission = 'opportunity.view'
        where m.user_id = auth.uid() and m.is_active and s.org_type in ('supplier', 'both')
          and s.profile_status = 'approved' and s.is_active
      ))
    )
  )
$$;

-- Propostas: o fornecedor vê as suas; o comprador vê as submetidas e, se o pedido for
-- selado, apenas depois do prazo final (propostas seladas até ao fim do prazo).
create or replace function public.can_view_proposal(p_proposal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.proposals p
    join public.opportunities o on o.id = p.opportunity_id
    where p.id = p_proposal and (
      public.has_org_permission(p.supplier_org_id, 'proposal.view')
      or (
        p.status <> 'draft'
        and public.has_org_permission(o.buyer_org_id, 'proposal.view')
        and (not o.sealed_until_deadline or now() >= public.final_deadline(o.id))
      )
    )
  )
$$;

-- O comprador tem relação com o fornecedor se o convidou ou se recebeu proposta dele.
create or replace function public.buyer_related_to_supplier(p_supplier uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.opportunities o
    where public.has_org_permission(o.buyer_org_id, p_perm) and o.status <> 'draft' and (
      exists (select 1 from public.supplier_invitations i
              where i.opportunity_id = o.id and i.supplier_org_id = p_supplier)
      or exists (select 1 from public.proposals p
                 where p.opportunity_id = o.id and p.supplier_org_id = p_supplier and p.status <> 'draft')
    )
  )
$$;

create or replace function public.can_view_document(p_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc and (
      public.has_org_permission(d.organization_id, 'document.view')
      or public.is_superadmin()
      -- consentimento por submissão: documentos aprovados de fornecedores que responderam
      or (d.status = 'approved' and exists (
        select 1 from public.proposals p
        join public.opportunities o on o.id = p.opportunity_id
        where p.supplier_org_id = d.organization_id and p.status <> 'draft'
          and public.has_org_permission(o.buyer_org_id, 'document.view')
      ))
    )
  )
$$;

create or replace function public.can_view_attachment(p_att uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.attachments a
    where a.id = p_att and (
      public.is_org_member(a.organization_id)
      or (a.entity_type = 'opportunity' and public.can_view_opportunity(a.entity_id))
      or (a.entity_type = 'proposal' and public.can_view_proposal(a.entity_id))
    )
  )
$$;

create or replace function public.org_is_listed(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_org and o.is_active and o.profile_status = 'approved'
      and o.visibility <> 'private' and o.visibility_consent_at is not null
      and (o.visibility = 'public' or auth.uid() is not null)
  )
$$;

create or replace function public.org_visible_to_me(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.org_is_listed(p_org)
      or public.is_org_member(p_org)
      or public.is_superadmin()
      or public.buyer_related_to_supplier(p_org, 'opportunity.view')
      or exists (select 1 from public.opportunities o
                 where o.buyer_org_id = p_org and public.can_view_opportunity(o.id))
$$;

create or replace function public.org_shows_field(p_org uuid, p_field text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_member(p_org) or public.is_superadmin()
      or exists (select 1 from public.organizations o where o.id = p_org and p_field = any (o.public_fields))
$$;

-- --------------------------------------------- Vista de directório (campos mascarados)
-- Executa com os privilégios do dono (ignora RLS da tabela), mas só devolve linhas
-- visíveis ao utilizador e só preenche campos opcionais autorizados pela organização.
create or replace view public.supplier_directory as
select
  o.id, o.legal_name, o.trade_name, o.org_type, o.sector, o.province, o.municipality,
  o.description, o.founded_year, o.profile_status, o.verification_status,
  o.verification_scope, o.verified_at, o.visibility, o.profile_updated_at,
  case when public.org_shows_field(o.id, 'nif') then o.nif end as nif,
  case when public.org_shows_field(o.id, 'address') then o.address end as address,
  case when public.org_shows_field(o.id, 'phone') then o.phone end as phone,
  case when public.org_shows_field(o.id, 'email') then o.email end as email,
  case when public.org_shows_field(o.id, 'website') then o.website end as website,
  case when public.org_shows_field(o.id, 'contact_person') then o.contact_person end as contact_person,
  case when public.org_shows_field(o.id, 'employee_count') then o.employee_count end as employee_count,
  case when public.org_shows_field(o.id, 'capabilities') then o.capabilities end as capabilities,
  case when public.org_shows_field(o.id, 'certifications') then o.certifications_declared else '{}'::text[] end
    as certifications_declared,
  coalesce((select array_agg(distinct s.category_id) from public.services s where s.organization_id = o.id),
           '{}'::uuid[]) as category_ids,
  coalesce((select string_agg(s.name || ' ' || array_to_string(s.specialties, ' '), ' ')
            from public.services s where s.organization_id = o.id), '') as service_text,
  (select count(*) from public.services s where s.organization_id = o.id)::int as service_count,
  case when public.org_shows_field(o.id, 'compliance') then coalesce((
    select array_agg(distinct d.document_type_id) from public.documents d
    where d.organization_id = o.id and d.status = 'approved'
      and (d.valid_until is null or d.valid_until >= current_date)
  ), '{}'::uuid[]) else '{}'::uuid[] end as valid_doc_type_ids
from public.organizations o
where o.is_active and public.org_visible_to_me(o.id);

-- ------------------------------------------------------------ Activar RLS
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ------------------------------------------------------------- Privilégios
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.categories to anon, authenticated;
grant select on public.supplier_directory to anon, authenticated;
grant select on public.services to anon, authenticated;

grant select on
  public.profiles, public.roles, public.permissions, public.role_permissions,
  public.organizations, public.organization_members, public.document_types,
  public.qualification_requirements, public.documents, public.document_versions,
  public.document_reviews, public.opportunities, public.opportunity_items,
  public.evaluation_criteria, public.deadline_extensions, public.supplier_invitations,
  public.clarifications, public.opportunity_notices, public.proposals, public.proposal_items,
  public.proposal_versions, public.evaluations, public.commercial_decisions,
  public.attachments, public.notifications, public.notification_preferences,
  public.audit_logs, public.platform_settings
to authenticated;

-- Escrita directa (restrita por RLS + gatilhos de guarda)
grant update (full_name, phone, job_title) on public.profiles to authenticated;
grant update (legal_name, trade_name, nif, commercial_registry, org_type, sector, province,
  municipality, address, phone, email, website, contact_person, description, founded_year,
  employee_count, capabilities, certifications_declared, visibility, public_fields)
  on public.organizations to authenticated;
grant insert, update, delete on public.services to authenticated;
grant insert, update, delete on public.opportunity_items, public.evaluation_criteria to authenticated;
grant insert (buyer_org_id, title, description, category_id, responsible_id, delivery_location,
  deadline, currency, commercial_terms, technical_requirements, required_document_type_ids,
  visibility, sealed_until_deadline, created_by) on public.opportunities to authenticated;
grant update (title, description, category_id, responsible_id, delivery_location, deadline, currency,
  commercial_terms, technical_requirements, required_document_type_ids, visibility,
  sealed_until_deadline, duplicate_of) on public.opportunities to authenticated;
grant insert, update, delete on public.evaluations to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert, update, delete on public.notification_preferences to authenticated;
-- Configuração global: apenas superadministrador (RLS)
grant insert, update, delete on public.categories, public.document_types,
  public.qualification_requirements, public.platform_settings to authenticated;
grant usage on sequence public.opportunity_seq to authenticated;

-- ------------------------------------------------------------- Políticas
-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_superadmin() or public.shares_org_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- catálogos
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

create policy categories_read_anon on public.categories for select to anon using (is_active);
create policy categories_read on public.categories for select to authenticated using (true);
create policy categories_write on public.categories for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy doctypes_read on public.document_types for select to authenticated using (true);
create policy doctypes_write on public.document_types for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy requirements_read on public.qualification_requirements for select to authenticated using (true);
create policy requirements_write on public.qualification_requirements for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy settings_read on public.platform_settings for select to authenticated using (true);
create policy settings_write on public.platform_settings for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- organizations (a leitura por terceiros faz-se pela vista supplier_directory)
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id) or public.is_superadmin());
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_permission(id, 'org.edit'))
  with check (public.has_org_permission(id, 'org.edit'));

create policy members_select on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id) or public.is_superadmin());

-- services
create policy services_select on public.services for select to anon, authenticated
  using (public.org_visible_to_me(organization_id));
create policy services_insert on public.services for insert to authenticated
  with check (public.has_org_permission(organization_id, 'services.manage'));
create policy services_update on public.services for update to authenticated
  using (public.has_org_permission(organization_id, 'services.manage'))
  with check (public.has_org_permission(organization_id, 'services.manage'));
create policy services_delete on public.services for delete to authenticated
  using (public.has_org_permission(organization_id, 'services.manage'));

-- documentos (só leitura; escrita via funções)
create policy documents_select on public.documents for select to authenticated
  using (public.can_view_document(id));
create policy document_versions_select on public.document_versions for select to authenticated
  using (public.can_view_document(document_id));
create policy document_reviews_select on public.document_reviews for select to authenticated
  using (public.can_view_document(document_id));

-- oportunidades
-- A primeira condição usa as colunas da própria linha (necessário para INSERT ... RETURNING,
-- em que funções que consultam a tabela ainda não "vêem" a linha nova).
create policy opportunities_select on public.opportunities for select to authenticated
  using (public.has_org_permission(buyer_org_id, 'opportunity.view') or public.can_view_opportunity(id));
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check (
    public.has_org_permission(buyer_org_id, 'opportunity.create')
    and public.org_type_of(buyer_org_id) in ('buyer', 'both')
    and status = 'draft' and created_by = auth.uid()
  );
create policy opportunities_update on public.opportunities for update to authenticated
  using (public.has_org_permission(buyer_org_id, 'opportunity.manage')
         and status in ('draft', 'published', 'invites_sent', 'open', 'clarification'))
  with check (public.has_org_permission(buyer_org_id, 'opportunity.manage'));

create or replace function public.opp_items_editable(p_opp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.opportunities o
                 where o.id = p_opp and o.status = 'draft'
                   and public.has_org_permission(o.buyer_org_id, 'opportunity.manage'))
$$;

create policy opp_items_select on public.opportunity_items for select to authenticated
  using (public.can_view_opportunity(opportunity_id));
create policy opp_items_write on public.opportunity_items for all to authenticated
  using (public.opp_items_editable(opportunity_id)) with check (public.opp_items_editable(opportunity_id));

create policy criteria_select on public.evaluation_criteria for select to authenticated
  using (public.can_view_opportunity(opportunity_id));
create policy criteria_write on public.evaluation_criteria for all to authenticated
  using (public.opp_items_editable(opportunity_id)) with check (public.opp_items_editable(opportunity_id));

create policy extensions_select on public.deadline_extensions for select to authenticated
  using (
    exists (select 1 from public.opportunities o
            where o.id = opportunity_id and public.has_org_permission(o.buyer_org_id, 'opportunity.view'))
    or (public.can_view_opportunity(opportunity_id)
        and (supplier_org_id is null or public.is_org_member(supplier_org_id)))
  );

create policy invitations_select on public.supplier_invitations for select to authenticated
  using (
    public.has_org_permission(supplier_org_id, 'opportunity.view')
    or exists (select 1 from public.opportunities o
               where o.id = opportunity_id and public.has_org_permission(o.buyer_org_id, 'opportunity.view'))
  );

create policy clarifications_select on public.clarifications for select to authenticated
  using (
    public.has_org_permission(supplier_org_id, 'opportunity.view')
    or exists (select 1 from public.opportunities o
               where o.id = opportunity_id and public.has_org_permission(o.buyer_org_id, 'opportunity.view'))
  );

create policy notices_select on public.opportunity_notices for select to authenticated
  using (public.can_view_opportunity(opportunity_id));

-- propostas (só leitura; escrita via funções)
create policy proposals_select on public.proposals for select to authenticated
  using (public.can_view_proposal(id));
create policy proposal_items_select on public.proposal_items for select to authenticated
  using (public.can_view_proposal(proposal_id));
create policy proposal_versions_select on public.proposal_versions for select to authenticated
  using (public.can_view_proposal(proposal_id));

create or replace function public.can_evaluate_proposal(p_proposal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.proposals p join public.opportunities o on o.id = p.opportunity_id
    where p.id = p_proposal and p.status in ('submitted', 'in_evaluation')
      and o.status in ('under_evaluation', 'clarification', 'closed')
      and public.has_org_permission(o.buyer_org_id, 'proposal.evaluate')
  )
$$;

create policy evaluations_select on public.evaluations for select to authenticated
  using (exists (select 1 from public.proposals p join public.opportunities o on o.id = p.opportunity_id
                 where p.id = proposal_id and public.has_org_permission(o.buyer_org_id, 'proposal.view')));
create policy evaluations_insert on public.evaluations for insert to authenticated
  with check (evaluator_id = auth.uid() and public.can_evaluate_proposal(proposal_id));
create policy evaluations_update on public.evaluations for update to authenticated
  using (evaluator_id = auth.uid() and public.can_evaluate_proposal(proposal_id))
  with check (evaluator_id = auth.uid() and public.can_evaluate_proposal(proposal_id));
create policy evaluations_delete on public.evaluations for delete to authenticated
  using (evaluator_id = auth.uid() and public.can_evaluate_proposal(proposal_id));

create policy decisions_select on public.commercial_decisions for select to authenticated
  using (exists (select 1 from public.opportunities o
                 where o.id = opportunity_id and public.has_org_permission(o.buyer_org_id, 'opportunity.view')));

create policy attachments_select on public.attachments for select to authenticated
  using (public.can_view_attachment(id));

-- notificações e preferências
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prefs_all on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- auditoria (só leitura)
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_superadmin()
         or (organization_id is not null and public.has_org_permission(organization_id, 'audit.view')));

-- ----------------------------------------------------- Armazenamento privado
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800),
       ('attachments', 'attachments', false, 52428800)
on conflict (id) do update set public = false;

-- Estrutura de caminhos: {organization_id}/{documento ou entidade}/{ficheiro}
create policy storage_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and public.has_org_permission(public.safe_uuid((storage.foldername(name))[1]), 'document.upload'));
create policy storage_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (
    select 1 from public.document_versions v
    where v.storage_path = storage.objects.name and public.can_view_document(v.document_id)));

create policy storage_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (
    public.has_org_permission(public.safe_uuid((storage.foldername(name))[1]), 'opportunity.manage')
    or public.has_org_permission(public.safe_uuid((storage.foldername(name))[1]), 'proposal.submit')));
create policy storage_attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and exists (
    select 1 from public.attachments a
    where a.storage_path = storage.objects.name and public.can_view_attachment(a.id)));

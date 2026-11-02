-- =============================================================================
-- JOVEM+ SUPPLIERS — Migração 003: regras de negócio no servidor
-- Funções SECURITY DEFINER (search_path fixo) que validam permissões, prazos,
-- cálculos e transições de estado. O cliente nunca escreve directamente nestas
-- tabelas. Códigos de erro (mensagem) são mapeados no frontend.
-- =============================================================================

-- ------------------------------------------------------------ Infraestrutura
create or replace function public.setting(p_key text, p_default jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.platform_settings where key = p_key), p_default)
$$;

create or replace function public.require_auth() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return auth.uid();
end $$;

create or replace function public.require_perm(p_org uuid, p_perm text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_org_permission(p_org, p_perm) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
end $$;

create or replace function public.require_superadmin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
end $$;

-- Limite de pedidos por utilizador e acção (protecção contra abuso).
create or replace function public.check_rate_limit(p_action text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from public.rate_limit_events
   where user_id = auth.uid() and action = p_action and created_at > now() - p_window;
  if v_count >= p_max then
    raise exception 'RATE_LIMIT_EXCEEDED' using errcode = '54000';
  end if;
  insert into public.rate_limit_events (user_id, action) values (auth.uid(), p_action);
  delete from public.rate_limit_events where created_at < now() - interval '2 days';
end $$;

create or replace function public.write_audit(
  p_actor uuid, p_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, details)
  values (p_actor, p_org, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'));
$$;

-- ------------------------------------------------------------- Notificações
create or replace function public.notify(
  p_user uuid, p_org uuid, p_type text, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_in_app boolean; v_email boolean;
begin
  select in_app, email into v_in_app, v_email
    from public.notification_preferences where user_id = p_user and type = p_type;
  if coalesce(v_in_app, true) then
    insert into public.notifications
      (user_id, organization_id, type, title, body, entity_type, entity_id, dedupe_key, email_status)
    values (p_user, p_org, p_type, p_title, p_body, p_entity_type, p_entity_id, p_dedupe,
            case when coalesce(v_email, false) then 'pending' else 'not_configured' end)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
end $$;

create or replace function public.notify_org(
  p_org uuid, p_perm text, p_type text, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select distinct m.user_id from public.organization_members m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = p_org and m.is_active and rp.permission = p_perm
  loop
    perform public.notify(r.user_id, p_org, p_type, p_title, p_body, p_entity_type, p_entity_id,
                          case when p_dedupe is null then null else p_dedupe end);
  end loop;
end $$;

create or replace function public.notify_superadmins(
  p_type text, p_title text, p_body text, p_entity_type text, p_entity_id uuid, p_dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where is_superadmin and is_active loop
    perform public.notify(r.id, null, p_type, p_title, p_body, p_entity_type, p_entity_id, p_dedupe);
  end loop;
end $$;

-- --------------------------------------------------------------- Auditoria
create or replace function public.audit_org_of(p_table text, p_row jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  return case p_table
    when 'organizations' then (p_row->>'id')::uuid
    when 'organization_members' then (p_row->>'organization_id')::uuid
    when 'documents' then (p_row->>'organization_id')::uuid
    when 'services' then (p_row->>'organization_id')::uuid
    when 'opportunities' then (p_row->>'buyer_org_id')::uuid
    when 'proposals' then (p_row->>'supplier_org_id')::uuid
    when 'document_reviews' then (select organization_id from public.documents where id = (p_row->>'document_id')::uuid)
    when 'commercial_decisions' then (select buyer_org_id from public.opportunities where id = (p_row->>'opportunity_id')::uuid)
    when 'deadline_extensions' then (select buyer_org_id from public.opportunities where id = (p_row->>'opportunity_id')::uuid)
    when 'supplier_invitations' then (select buyer_org_id from public.opportunities where id = (p_row->>'opportunity_id')::uuid)
    else null end;
end $$;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_diff jsonb := '{}'; v_key text; v_row jsonb; v_id uuid;
  v_skip text[] := array['updated_at', 'profile_updated_at', 'created_at'];
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  v_id := nullif(v_row->>'id', '')::uuid;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any (v_skip)) and v_old->v_key is distinct from v_new->v_key then
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('de', v_old->v_key, 'para', v_new->v_key));
      end if;
    end loop;
    if v_diff = '{}'::jsonb then return new; end if;
  else
    v_diff := jsonb_strip_nulls(jsonb_build_object(
      'estado', v_row->>'status', 'resultado', v_row->>'result', 'funcao', v_row->>'role',
      'titulo', v_row->>'title', 'numero', v_row->>'number', 'nome', v_row->>'legal_name'));
  end if;
  perform public.write_audit(auth.uid(), public.audit_org_of(tg_table_name, v_row),
                             tg_table_name || '.' || lower(tg_op), tg_table_name, v_id, v_diff);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','organization_members','services','documents','document_reviews','opportunities',
    'deadline_extensions','supplier_invitations','proposals','commercial_decisions',
    'categories','document_types','qualification_requirements','platform_settings'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- Imutabilidade de registos históricos
create or replace function public.block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'IMMUTABLE_RECORD' using errcode = '42501';
end $$;
create trigger proposal_versions_immutable before update or delete on public.proposal_versions
  for each row execute function public.block_mutation();
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.block_mutation();
create trigger document_reviews_immutable before update or delete on public.document_reviews
  for each row execute function public.block_mutation();
create trigger commercial_decisions_immutable before update or delete on public.commercial_decisions
  for each row execute function public.block_mutation();

-- ---------------------------------------------------------- Gatilhos de guarda
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Organizações: NIF bloqueado após verificação; consentimento de visibilidade registado
create or replace function public.guard_organization() returns trigger
language plpgsql as $$
begin
  if new.nif is distinct from old.nif and old.verification_status <> 'not_verified'
     and current_user in ('authenticated', 'anon') then
    raise exception 'NIF_LOCKED_AFTER_VERIFICATION' using errcode = '42501';
  end if;
  if new.nif !~ '^[0-9]{10}$|^[0-9]{9}[A-Z]{2}[0-9]{3}$' then
    raise exception 'INVALID_NIF' using errcode = '22023';
  end if;
  if new.visibility is distinct from old.visibility then
    new.visibility_consent_at := case when new.visibility = 'private' then null else now() end;
  end if;
  if row(new.legal_name, new.trade_name, new.nif, new.commercial_registry, new.sector, new.province,
         new.municipality, new.address, new.phone, new.email, new.website, new.contact_person,
         new.description, new.founded_year, new.employee_count, new.capabilities,
         new.certifications_declared, new.visibility, new.public_fields)
     is distinct from
     row(old.legal_name, old.trade_name, old.nif, old.commercial_registry, old.sector, old.province,
         old.municipality, old.address, old.phone, old.email, old.website, old.contact_person,
         old.description, old.founded_year, old.employee_count, old.capabilities,
         old.certifications_declared, old.visibility, old.public_fields) then
    new.profile_updated_at := now();
    if old.profile_status in ('draft', 'rejected') then null; end if;
  end if;
  return new;
end $$;
create trigger organizations_guard before update on public.organizations
  for each row execute function public.guard_organization();

-- Oportunidades: prazo e moeda só mudam em rascunho (extensões via extend_deadline)
create or replace function public.guard_opportunity() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and old.status <> 'draft' then
    if new.deadline is distinct from old.deadline or new.currency is distinct from old.currency
       or new.sealed_until_deadline is distinct from old.sealed_until_deadline then
      raise exception 'USE_EXTEND_DEADLINE' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger opportunities_guard before update on public.opportunities
  for each row execute function public.guard_opportunity();

-- Alterações relevantes a pedidos já publicados notificam os convidados
create or replace function public.notify_opportunity_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if old.status <> 'draft' and (
       new.description is distinct from old.description
    or new.technical_requirements is distinct from old.technical_requirements
    or new.commercial_terms is distinct from old.commercial_terms
    or new.delivery_location is distinct from old.delivery_location) then
    for r in select supplier_org_id from public.supplier_invitations where opportunity_id = new.id loop
      perform public.notify_org(r.supplier_org_id, 'opportunity.view', 'opportunity_changed',
        'Pedido ' || new.number || ' foi alterado', 'Reveja as condições actualizadas antes de submeter a proposta.',
        'opportunity', new.id, 'opp:' || new.id || ':chg:' || extract(epoch from now())::bigint);
    end loop;
  end if;
  return new;
end $$;
create trigger opportunities_notify_change after update on public.opportunities
  for each row execute function public.notify_opportunity_change();

-- ------------------------------------------------------------ Contexto/sessão
create or replace function public.my_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_auth(); v_profile jsonb; v_memberships jsonb; v_super boolean;
begin
  select to_jsonb(p) - 'created_at' - 'updated_at', p.is_superadmin and p.is_active
    into v_profile, v_super from public.profiles p where p.id = v_uid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', o.id,
    'organization', jsonb_build_object('id', o.id, 'legal_name', o.legal_name, 'trade_name', o.trade_name,
        'org_type', o.org_type, 'profile_status', o.profile_status,
        'verification_status', o.verification_status, 'nif', o.nif),
    'roles', x.roles, 'permissions', x.perms)), '[]')
  into v_memberships
  from public.organizations o
  join lateral (
    select array_agg(distinct m.role) as roles,
           coalesce(array_agg(distinct rp.permission) filter (where rp.permission is not null), '{}') as perms
    from public.organization_members m
    left join public.role_permissions rp on rp.role = m.role
    where m.organization_id = o.id and m.user_id = v_uid and m.is_active
  ) x on x.roles is not null and o.is_active;
  return jsonb_build_object(
    'profile', v_profile, 'is_superadmin', coalesce(v_super, false), 'memberships', v_memberships,
    'platform_permissions', case when coalesce(v_super, false)
      then (select coalesce(array_agg(permission), '{}') from public.role_permissions where role = 'superadmin')
      else '{}'::text[] end);
end $$;

-- ----------------------------------------------------------- Organizações
create or replace function public.create_organization(
  p_legal_name text, p_trade_name text, p_nif text, p_org_type public.org_type,
  p_sector text, p_province text, p_municipality text, p_email text, p_phone text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_auth(); v_id uuid;
begin
  perform public.check_rate_limit('create_organization', 5, interval '1 hour');
  if p_nif !~ '^[0-9]{10}$|^[0-9]{9}[A-Z]{2}[0-9]{3}$' then
    raise exception 'INVALID_NIF' using errcode = '22023';
  end if;
  begin
    insert into public.organizations
      (legal_name, trade_name, nif, org_type, sector, province, municipality, email, phone, created_by)
    values (trim(p_legal_name), nullif(trim(p_trade_name), ''), p_nif, p_org_type, p_sector, p_province,
            p_municipality, p_email, p_phone, v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'NIF_ALREADY_REGISTERED' using errcode = '23505';
  end;
  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (v_id, v_uid, 'org_admin', v_uid);
  if p_org_type in ('supplier', 'both') then
    insert into public.organization_members (organization_id, user_id, role, invited_by)
    values (v_id, v_uid, 'supplier', v_uid);
  end if;
  if p_org_type in ('buyer', 'both') then
    insert into public.organization_members (organization_id, user_id, role, invited_by)
    values (v_id, v_uid, 'buyer', v_uid);
  end if;
  return v_id;
end $$;

-- Campos obrigatórios do perfil: configuráveis em platform_settings.profile_required_fields
create or replace function public.org_missing_fields(p_org uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare v_row jsonb; v_field text; v_val text; v_missing text[] := '{}';
begin
  select to_jsonb(o) into v_row from public.organizations o where o.id = p_org;
  for v_field in select jsonb_array_elements_text(
      public.setting('profile_required_fields', '["legal_name","nif","sector","province","municipality","address","phone","email","contact_person","description","services"]'::jsonb)) loop
    if v_field = 'services' then
      if not exists (select 1 from public.services where organization_id = p_org) then
        v_missing := v_missing || v_field;
      end if;
    else
      v_val := v_row->>v_field;
      if v_val is null or trim(v_val) = '' or v_val = '[]' then
        v_missing := v_missing || v_field;
      end if;
    end if;
  end loop;
  return v_missing;
end $$;

create or replace function public.submit_profile(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_missing text[]; v_status public.profile_status; v_name text;
begin
  perform public.require_auth();
  perform public.require_perm(p_org, 'org.edit');
  select profile_status, legal_name into v_status, v_name from public.organizations where id = p_org;
  if v_status not in ('draft', 'incomplete', 'corrections_pending') then
    raise exception 'INVALID_STATE_TRANSITION';
  end if;
  v_missing := public.org_missing_fields(p_org);
  if array_length(v_missing, 1) > 0 then
    raise exception 'PROFILE_INCOMPLETE: %', array_to_string(v_missing, ',');
  end if;
  update public.organizations set profile_status = 'submitted', submitted_at = now(), profile_review_reason = null
   where id = p_org;
  perform public.notify_superadmins('profile_submitted', 'Perfil submetido para análise',
    v_name || ' submeteu o perfil empresarial.', 'organization', p_org, 'org:' || p_org || ':sub:' || extract(epoch from now())::bigint);
end $$;

create or replace function public.review_profile(p_org uuid, p_result text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_new public.profile_status; v_missing text[];
begin
  perform public.require_superadmin();
  if p_result not in ('under_review', 'approved', 'corrections_pending', 'rejected', 'suspended') then
    raise exception 'INVALID_STATE_TRANSITION';
  end if;
  if p_result in ('corrections_pending', 'rejected', 'suspended') and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_result = 'approved' then
    v_missing := public.org_missing_fields(p_org);
    if array_length(v_missing, 1) > 0 then
      raise exception 'PROFILE_INCOMPLETE: %', array_to_string(v_missing, ',');
    end if;
  end if;
  v_new := p_result::public.profile_status;
  update public.organizations set profile_status = v_new, profile_review_reason = p_reason where id = p_org;
  perform public.notify_org(p_org, 'org.edit', 'profile_' || p_result,
    case p_result when 'approved' then 'Perfil aprovado' when 'under_review' then 'Perfil em análise'
      when 'corrections_pending' then 'Perfil com correcções pendentes'
      when 'rejected' then 'Perfil rejeitado' else 'Perfil suspenso' end,
    p_reason, 'organization', p_org);
end $$;

create or replace function public.set_verification(p_org uuid, p_status public.verification_status, p_scope text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_superadmin();
  if p_status = 'verified' then
    if length(trim(coalesce(p_scope, ''))) < 5 then raise exception 'VERIFICATION_SCOPE_REQUIRED'; end if;
    if not exists (select 1 from public.organizations where id = p_org and profile_status = 'approved') then
      raise exception 'PROFILE_NOT_APPROVED';
    end if;
    if not exists (select 1 from public.documents where organization_id = p_org and status = 'approved'
                   and (valid_until is null or valid_until >= current_date)) then
      raise exception 'NO_APPROVED_DOCUMENTS';
    end if;
    update public.organizations set verification_status = 'verified', verification_scope = trim(p_scope),
      verified_at = now(), verified_by = auth.uid() where id = p_org;
  else
    update public.organizations set verification_status = p_status, verification_scope = null,
      verified_at = null, verified_by = null where id = p_org;
  end if;
  perform public.write_audit(auth.uid(), p_org, 'organization.verification', 'organization', p_org,
    jsonb_build_object('estado', p_status, 'ambito', p_scope));
end $$;

create or replace function public.admin_set_org_active(p_org uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_superadmin();
  update public.organizations set is_active = p_active where id = p_org;
end $$;

-- ------------------------------------------------------------------ Membros
create or replace function public.list_org_members(p_org uuid)
returns table (member_id uuid, user_id uuid, full_name text, email text, role public.app_role,
               is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
declare v_manage boolean;
begin
  if not (public.is_org_member(p_org) or public.is_superadmin()) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  v_manage := public.has_org_permission(p_org, 'org.members.manage') or public.is_superadmin();
  return query
    select m.id, m.user_id, p.full_name, case when v_manage then u.email::text end,
           m.role, m.is_active, m.created_at
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.organization_id = p_org order by p.full_name, m.role;
end $$;

create or replace function public.add_member(p_org uuid, p_email text, p_role public.app_role)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := public.require_auth(); v_target uuid;
begin
  perform public.require_perm(p_org, 'org.members.manage');
  perform public.check_rate_limit('add_member', 30, interval '1 hour');
  if p_role = 'superadmin' then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  select id into v_target from auth.users where lower(email) = lower(trim(p_email));
  if v_target is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target = v_uid then raise exception 'CANNOT_CHANGE_OWN_ROLES' using errcode = '42501'; end if;
  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (p_org, v_target, p_role, v_uid)
  on conflict (organization_id, user_id, role) do update set is_active = true;
  perform public.notify(v_target, p_org, 'member_added', 'Foi associado a uma organização',
    'Foi-lhe atribuída a função ' || p_role || '.', 'organization', p_org);
end $$;

create or replace function public.set_member_active(p_member uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_user uuid; v_role public.app_role;
begin
  perform public.require_auth();
  select organization_id, user_id, role into v_org, v_user, v_role
    from public.organization_members where id = p_member;
  if v_org is null then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v_org, 'org.members.manage');
  if v_user = auth.uid() then raise exception 'CANNOT_CHANGE_OWN_ROLES' using errcode = '42501'; end if;
  if not p_active and v_role = 'org_admin' and
     (select count(*) from public.organization_members
       where organization_id = v_org and role = 'org_admin' and is_active and id <> p_member) = 0 then
    raise exception 'LAST_ADMIN';
  end if;
  update public.organization_members set is_active = p_active where id = p_member;
end $$;

create or replace function public.admin_list_users()
returns table (id uuid, full_name text, email text, is_superadmin boolean, is_active boolean,
               organizations int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.require_superadmin();
  return query
    select p.id, p.full_name, u.email::text, p.is_superadmin, p.is_active,
           (select count(distinct m.organization_id)::int from public.organization_members m
             where m.user_id = p.id and m.is_active), p.created_at
    from public.profiles p left join auth.users u on u.id = p.id order by p.created_at desc;
end $$;

create or replace function public.admin_set_user_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_superadmin();
  if p_user = auth.uid() then raise exception 'CANNOT_CHANGE_OWN_ROLES' using errcode = '42501'; end if;
  update public.profiles set is_active = p_active where id = p_user;
  perform public.write_audit(auth.uid(), null, 'profiles.set_active', 'profile', p_user,
    jsonb_build_object('activo', p_active));
end $$;

-- ---------------------------------------------------------------- Documentos
create or replace function public.upload_document(
  p_org uuid, p_type uuid, p_title text, p_reference text, p_issue date, p_valid date,
  p_storage_path text, p_file_name text, p_file_size bigint, p_mime text, p_document_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_auth(); v_type public.document_types; v_doc public.documents;
  v_version int := 1; v_ver_id uuid; v_doc_id uuid;
begin
  perform public.require_perm(p_org, 'document.upload');
  perform public.check_rate_limit('upload_document', 40, interval '1 hour');
  select * into v_type from public.document_types where id = p_type and is_active;
  if not found then raise exception 'INVALID_DOCUMENT_TYPE'; end if;
  if not (p_mime = any (v_type.allowed_mime)) then raise exception 'INVALID_FILE_TYPE'; end if;
  if p_file_size <= 0 or p_file_size > v_type.max_size_mb * 1024 * 1024 then raise exception 'FILE_TOO_LARGE'; end if;
  if v_type.requires_expiry and p_valid is null then raise exception 'EXPIRY_REQUIRED'; end if;
  if p_valid is not null and p_issue is not null and p_valid < p_issue then raise exception 'INVALID_DATES'; end if;
  if left(p_storage_path, 37) <> p_org::text || '/' then raise exception 'INVALID_STORAGE_PATH' using errcode = '42501'; end if;

  if p_document_id is not null then
    select * into v_doc from public.documents where id = p_document_id and organization_id = p_org for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_doc.status = 'under_review' then raise exception 'DOCUMENT_UNDER_REVIEW'; end if;
    v_version := v_doc.current_version + 1;
    update public.document_versions set status = 'superseded'
     where document_id = v_doc.id and status <> 'superseded';
    update public.documents set current_version = v_version, title = p_title, reference_number = p_reference,
      issue_date = p_issue, valid_until = p_valid, status = 'submitted', submitted_at = now(),
      reviewed_by = null, reviewed_at = null, review_reason = null,
      file_name = p_file_name, file_size = p_file_size, mime_type = p_mime
     where id = v_doc.id;
    v_doc_id := v_doc.id;
  else
    insert into public.documents (organization_id, document_type_id, title, reference_number, issue_date,
      valid_until, file_name, file_size, mime_type, created_by)
    values (p_org, p_type, p_title, p_reference, p_issue, p_valid, p_file_name, p_file_size, p_mime, v_uid)
    returning id into v_doc_id;
  end if;

  insert into public.document_versions (document_id, version, storage_path, file_name, file_size, mime_type,
    reference_number, issue_date, valid_until, uploaded_by)
  values (v_doc_id, v_version, p_storage_path, p_file_name, p_file_size, p_mime, p_reference, p_issue, p_valid, v_uid)
  returning id into v_ver_id;

  perform public.notify_superadmins('document_submitted', 'Documento submetido para análise',
    p_title, 'document', v_doc_id, 'docsub:' || v_ver_id);
  return v_doc_id;
end $$;

create or replace function public.start_document_review(p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_superadmin();
  update public.documents set status = 'under_review' where id = p_doc and status = 'submitted';
  if not found then raise exception 'INVALID_STATE_TRANSITION'; end if;
  update public.document_versions v set status = 'under_review'
   from public.documents d where d.id = p_doc and v.document_id = d.id and v.version = d.current_version;
end $$;

create or replace function public.review_document(p_doc uuid, p_result public.review_result, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_doc public.documents; v_ver uuid; v_status public.doc_status; v_title text;
begin
  perform public.require_superadmin();
  select * into v_doc from public.documents where id = p_doc for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_doc.status not in ('submitted', 'under_review') then raise exception 'INVALID_STATE_TRANSITION'; end if;
  if p_result <> 'approved' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  v_status := case p_result when 'approved' then 'approved' when 'rejected' then 'rejected'
                            else 'correction_pending' end::public.doc_status;
  select id into v_ver from public.document_versions where document_id = p_doc and version = v_doc.current_version;
  insert into public.document_reviews (document_id, version_id, reviewer_id, result, reason)
  values (p_doc, v_ver, auth.uid(), p_result, p_reason);
  update public.document_versions set status = v_status where id = v_ver;
  update public.documents set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(),
    review_reason = p_reason where id = p_doc;
  v_title := v_doc.title;
  perform public.notify_org(v_doc.organization_id, 'document.upload',
    case p_result when 'approved' then 'document_approved' when 'rejected' then 'document_rejected'
                  else 'document_correction' end,
    case p_result when 'approved' then 'Documento aprovado: ' when 'rejected' then 'Documento rejeitado: '
                  else 'Correcção pedida: ' end || v_title,
    p_reason, 'document', p_doc);
end $$;

create or replace function public.request_document_access(p_doc uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_path text;
begin
  perform public.require_auth();
  if not public.can_view_document(p_doc) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  select d.organization_id, v.storage_path into v_org, v_path
    from public.documents d join public.document_versions v on v.document_id = d.id and v.version = d.current_version
   where d.id = p_doc;
  if not public.is_org_member(v_org) then
    perform public.write_audit(auth.uid(), v_org, 'documents.access', 'document', p_doc,
      jsonb_build_object('por', case when public.is_superadmin() then 'superadmin' else 'comprador' end));
  end if;
  return v_path;
end $$;

-- ------------------------------------------------------------- Oportunidades
create or replace function public.opp_transition_allowed(p_from public.opportunity_status, p_to public.opportunity_status)
returns boolean language sql immutable as $$
  select case
    when p_to = 'cancelled' then p_from in ('draft', 'published', 'invites_sent', 'open', 'clarification', 'under_evaluation', 'closed')
    else (p_from, p_to) in (
      ('draft', 'published'), ('published', 'invites_sent'), ('published', 'open'), ('invites_sent', 'open'),
      ('open', 'under_evaluation'), ('open', 'clarification'), ('open', 'closed'),
      ('clarification', 'open'), ('clarification', 'under_evaluation'), ('clarification', 'closed'),
      ('under_evaluation', 'clarification'), ('under_evaluation', 'closed'),
      ('closed', 'archived'), ('awarded', 'archived'), ('cancelled', 'archived'))
  end
$$;

create or replace function public.invite_internal(p_opp uuid, p_invitees uuid[], p_actor uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_num text; v_title text; r uuid; v_n int := 0; v_rows int;
begin
  select buyer_org_id, number, title into v_org, v_num, v_title from public.opportunities where id = p_opp;
  foreach r in array coalesce(p_invitees, '{}') loop
    if not exists (select 1 from public.organizations s where s.id = r and s.org_type in ('supplier', 'both')
                   and s.is_active and s.profile_status = 'approved') then
      raise exception 'SUPPLIER_NOT_ELIGIBLE';
    end if;
    if r = v_org then raise exception 'SUPPLIER_NOT_ELIGIBLE'; end if;
    insert into public.supplier_invitations (opportunity_id, supplier_org_id, invited_by)
    values (p_opp, r, p_actor) on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_n := v_n + 1;
      perform public.notify_org(r, 'opportunity.view', 'invitation', 'Convite para pedido de cotação ' || v_num,
        v_title, 'opportunity', p_opp, 'opp:' || p_opp || ':invite:' || r);
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.publish_opportunity(p_opp uuid, p_invitees uuid[], p_open boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_auth(); v_o public.opportunities; v_weights numeric; v_n int; r record;
begin
  select * into v_o from public.opportunities where id = p_opp for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v_o.buyer_org_id, 'opportunity.manage');
  if public.org_type_of(v_o.buyer_org_id) not in ('buyer', 'both') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  if v_o.status <> 'draft' then raise exception 'INVALID_STATE_TRANSITION'; end if;
  if not exists (select 1 from public.opportunity_items where opportunity_id = p_opp) then raise exception 'ITEMS_REQUIRED'; end if;
  if v_o.deadline <= now() then raise exception 'DEADLINE_IN_PAST'; end if;
  select coalesce(sum(weight), 0) into v_weights from public.evaluation_criteria where opportunity_id = p_opp;
  if v_weights <> 0 and v_weights <> 100 then raise exception 'CRITERIA_WEIGHTS_INVALID'; end if;
  if v_o.visibility = 'invited_only' and coalesce(array_length(p_invitees, 1), 0) = 0 then
    raise exception 'INVITEES_REQUIRED';
  end if;
  v_n := public.invite_internal(p_opp, p_invitees, v_uid);
  update public.opportunities set published_at = now(),
    status = case when p_open then 'open' when v_n > 0 then 'invites_sent' else 'published' end::public.opportunity_status
   where id = p_opp;
  if v_o.visibility = 'open_to_qualified' then
    for r in select distinct s.organization_id from public.services s
             join public.organizations org on org.id = s.organization_id
             where org.profile_status = 'approved' and org.is_active and org.id <> v_o.buyer_org_id
               and (v_o.category_id is null or s.category_id = v_o.category_id) loop
      perform public.notify_org(r.organization_id, 'opportunity.view', 'new_opportunity',
        'Novo pedido relevante: ' || v_o.number, v_o.title, 'opportunity', p_opp, 'opp:' || p_opp || ':relevant');
    end loop;
  end if;
  perform public.write_audit(v_uid, v_o.buyer_org_id, 'opportunities.publish', 'opportunity', p_opp,
    jsonb_build_object('convidados', v_n, 'aberto', p_open));
end $$;

create or replace function public.invite_suppliers(p_opp uuid, p_invitees uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_o public.opportunities;
begin
  perform public.require_auth();
  select * into v_o from public.opportunities where id = p_opp;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v_o.buyer_org_id, 'opportunity.manage');
  if v_o.status not in ('published', 'invites_sent', 'open', 'clarification') then raise exception 'INVALID_STATE_TRANSITION'; end if;
  return public.invite_internal(p_opp, p_invitees, auth.uid());
end $$;

create or replace function public.set_opportunity_status(p_opp uuid, p_to public.opportunity_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.opportunities; r record;
begin
  perform public.require_auth();
  select * into v_o from public.opportunities where id = p_opp for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v_o.buyer_org_id, 'opportunity.manage');
  if p_to = 'awarded' or not public.opp_transition_allowed(v_o.status, p_to) then
    raise exception 'INVALID_STATE_TRANSITION';
  end if;
  if p_to in ('cancelled') and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if p_to = 'under_evaluation' and public.final_deadline(p_opp) > now() and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DEADLINE_NOT_REACHED';
  end if;
  update public.opportunities set status = p_to,
    closed_at = case when p_to in ('closed', 'cancelled') then now() else closed_at end where id = p_opp;
  if p_to = 'under_evaluation' then
    update public.proposals set status = 'in_evaluation' where opportunity_id = p_opp and status = 'submitted';
  end if;
  perform public.write_audit(auth.uid(), v_o.buyer_org_id, 'opportunities.status', 'opportunity', p_opp,
    jsonb_build_object('de', v_o.status, 'para', p_to, 'motivo', p_reason));
  if p_to in ('cancelled', 'closed', 'under_evaluation', 'clarification') then
    for r in select supplier_org_id from public.supplier_invitations where opportunity_id = p_opp loop
      perform public.notify_org(r.supplier_org_id, 'opportunity.view', 'opportunity_status',
        'Pedido ' || v_o.number || ': estado alterado',
        'Novo estado: ' || p_to || coalesce('. ' || p_reason, ''), 'opportunity', p_opp,
        'opp:' || p_opp || ':st:' || p_to || ':' || extract(epoch from now())::bigint);
    end loop;
  end if;
end $$;

create or replace function public.extend_deadline(p_opp uuid, p_new timestamptz, p_supplier uuid default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.opportunities; v_prev timestamptz; r record;
begin
  perform public.require_auth();
  select * into v_o from public.opportunities where id = p_opp for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v_o.buyer_org_id, 'opportunity.manage');
  if v_o.status not in ('published', 'invites_sent', 'open', 'clarification', 'under_evaluation', 'closed') then
    raise exception 'INVALID_STATE_TRANSITION';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if p_supplier is not null and not exists (select 1 from public.supplier_invitations
      where opportunity_id = p_opp and supplier_org_id = p_supplier) then
    raise exception 'SUPPLIER_NOT_ELIGIBLE';
  end if;
  v_prev := case when p_supplier is null then public.final_deadline(p_opp) else public.effective_deadline(p_opp, p_supplier) end;
  if p_new <= v_prev then raise exception 'DEADLINE_MUST_BE_LATER'; end if;
  insert into public.deadline_extensions (opportunity_id, supplier_org_id, previous_deadline, new_deadline, reason, authorized_by)
  values (p_opp, p_supplier, v_prev, p_new, p_reason, auth.uid());
  if v_o.status in ('closed', 'under_evaluation') and p_new > now() then
    update public.opportunities set status = 'open', closed_at = null where id = p_opp;
    update public.proposals set status = 'submitted' where opportunity_id = p_opp and status = 'in_evaluation';
  end if;
  for r in select supplier_org_id from public.supplier_invitations
            where opportunity_id = p_opp and (p_supplier is null or supplier_org_id = p_supplier) loop
    perform public.notify_org(r.supplier_org_id, 'opportunity.view', 'deadline_extended',
      'Prazo prorrogado: ' || v_o.number, p_reason, 'opportunity', p_opp,
      'opp:' || p_opp || ':ext:' || extract(epoch from p_new)::bigint);
  end loop;
end $$;

create or replace function public.mark_invitation_viewed(p_opp uuid, p_supplier uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_perm(p_supplier, 'opportunity.view');
  update public.supplier_invitations set status = 'viewed', viewed_at = now()
   where opportunity_id = p_opp and supplier_org_id = p_supplier and status = 'sent';
end $$;

-- ------------------------------------------------------------- Propostas
-- Regra única de cálculo (espelhada em src/lib/domain/proposal.ts):
--   bruto = arred(qtd × preço); desconto = arred(bruto × desc%); subtotal = bruto − desconto;
--   imposto = arred(subtotal × imposto%); total = subtotal + imposto. Arredondamento a 2 casas
--   (metade afastada de zero). Os totais da proposta são a soma das linhas.
create or replace function public.calc_line(p_qty numeric, p_price numeric, p_disc numeric, p_tax numeric)
returns table (gross numeric, discount numeric, subtotal numeric, tax numeric, total numeric)
language sql immutable as $$
  with g as (select round(p_qty * p_price, 2) as gross),
       d as (select gross, round(gross * p_disc / 100, 2) as discount from g),
       s as (select gross, discount, gross - discount as subtotal from d),
       t as (select gross, discount, subtotal, round(subtotal * p_tax / 100, 2) as tax from s)
  select gross, discount, subtotal, tax, subtotal + tax from t
$$;

create or replace function public.save_proposal(p_supplier_org uuid, p_opp uuid, p_payload jsonb, p_submit boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_auth(); v_o public.opportunities; v_p public.proposals; v_pid uuid;
  v_item jsonb; v_oi public.opportunity_items; v_l record; v_n int; v_ver int;
  v_sub numeric := 0; v_disc numeric := 0; v_tax numeric := 0; v_tot numeric := 0;
  v_validity date := nullif(p_payload->>'validity_until', '')::date; v_missing uuid; v_num text;
  v_price numeric; v_dpct numeric; v_tpct numeric;
begin
  perform public.require_perm(p_supplier_org, 'proposal.submit');
  perform public.check_rate_limit('save_proposal', 60, interval '1 hour');
  if public.org_type_of(p_supplier_org) not in ('supplier', 'both') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  select * into v_o from public.opportunities where id = p_opp for share;
  if not found or not public.can_view_opportunity(p_opp) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  if v_o.buyer_org_id = p_supplier_org then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  if v_o.visibility = 'invited_only' and not exists (select 1 from public.supplier_invitations
       where opportunity_id = p_opp and supplier_org_id = p_supplier_org) then
    raise exception 'NOT_INVITED' using errcode = '42501';
  end if;
  if v_o.status not in ('open', 'clarification') then raise exception 'OPPORTUNITY_NOT_OPEN'; end if;
  if now() > public.effective_deadline(p_opp, p_supplier_org) then raise exception 'DEADLINE_PASSED'; end if;
  if p_payload ? 'currency' and p_payload->>'currency' <> v_o.currency then raise exception 'CURRENCY_MISMATCH'; end if;

  select * into v_p from public.proposals where opportunity_id = p_opp and supplier_org_id = p_supplier_org for update;
  if found then
    if v_p.status in ('selected', 'rejected') then raise exception 'INVALID_STATE_TRANSITION'; end if;
    if v_p.status in ('submitted', 'in_evaluation') and not p_submit then raise exception 'PROPOSAL_ALREADY_SUBMITTED'; end if;
    v_pid := v_p.id;
  else
    insert into public.proposals (opportunity_id, supplier_org_id, currency, created_by)
    values (p_opp, p_supplier_org, v_o.currency, v_uid) returning id into v_pid;
  end if;

  if p_submit then
    if v_validity is null or v_validity < (now() at time zone 'Africa/Luanda')::date then raise exception 'VALIDITY_REQUIRED'; end if;
    select d into v_missing from unnest(v_o.required_document_type_ids) d
     where not exists (select 1 from public.documents x where x.organization_id = p_supplier_org
        and x.document_type_id = d and x.status = 'approved' and (x.valid_until is null or x.valid_until >= current_date))
     limit 1;
    if v_missing is not null then raise exception 'MISSING_REQUIRED_DOCUMENTS'; end if;
  end if;

  delete from public.proposal_items where proposal_id = v_pid;
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]')) loop
    select * into v_oi from public.opportunity_items
     where id = (v_item->>'opportunity_item_id')::uuid and opportunity_id = p_opp;
    if not found then raise exception 'INVALID_ITEM'; end if;
    v_price := (v_item->>'unit_price')::numeric;
    v_dpct := coalesce((v_item->>'discount_pct')::numeric, 0);
    v_tpct := coalesce((v_item->>'tax_pct')::numeric, 0);
    if v_price < 0 or v_dpct not between 0 and 100 or v_tpct not between 0 and 100 then raise exception 'INVALID_AMOUNTS'; end if;
    select * into v_l from public.calc_line(v_oi.quantity, v_price, v_dpct, v_tpct);
    insert into public.proposal_items (proposal_id, opportunity_item_id, description, quantity, unit, unit_price,
      discount_pct, tax_pct, line_gross, line_discount, line_subtotal, line_tax, line_total)
    values (v_pid, v_oi.id, v_oi.description, v_oi.quantity, v_oi.unit, v_price, v_dpct, v_tpct,
            v_l.gross, v_l.discount, v_l.subtotal, v_l.tax, v_l.total);
    v_sub := v_sub + v_l.gross; v_disc := v_disc + v_l.discount; v_tax := v_tax + v_l.tax; v_tot := v_tot + v_l.total;
  end loop;

  if p_submit then
    select count(*) into v_n from public.proposal_items where proposal_id = v_pid;
    if v_n <> (select count(*) from public.opportunity_items where opportunity_id = p_opp) then
      raise exception 'ALL_ITEMS_REQUIRED';
    end if;
  end if;

  update public.proposals set subtotal = v_sub, discount_total = v_disc, tax_total = v_tax, total = v_tot,
    validity_until = v_validity, delivery_days = nullif(p_payload->>'delivery_days', '')::int,
    commercial_terms = p_payload->>'commercial_terms', notes = p_payload->>'notes', withdrawn_reason = null
   where id = v_pid;

  if p_submit then
    v_ver := (select current_version from public.proposals where id = v_pid) + 1;
    update public.proposals set current_version = v_ver, status = 'submitted', submitted_at = now(),
      first_submitted_at = coalesce(first_submitted_at, now()),
      receipt_code = 'REC-' || number || '-V' || v_ver, receipt_confirmed_at = now()
     where id = v_pid returning number into v_num;
    insert into public.proposal_versions (proposal_id, version, snapshot, total, currency, submitted_by)
    select v_pid, v_ver, jsonb_build_object(
        'header', to_jsonb(p) - 'id',
        'items', (select coalesce(jsonb_agg(to_jsonb(i) - 'id' - 'proposal_id' order by i.description), '[]')
                  from public.proposal_items i where i.proposal_id = v_pid)),
      p.total, p.currency, v_uid from public.proposals p where p.id = v_pid;
    update public.supplier_invitations set status = 'responded', responded_at = coalesce(responded_at, now())
     where opportunity_id = p_opp and supplier_org_id = p_supplier_org;
    perform public.notify_org(v_o.buyer_org_id, 'proposal.view', 'proposal_received',
      'Proposta recebida: ' || v_num, 'Pedido ' || v_o.number || '. O conteúdo fica selado até ao fim do prazo, se aplicável.',
      'proposal', v_pid, 'prop:' || v_pid || ':v' || v_ver);
    perform public.notify_org(p_supplier_org, 'proposal.view', 'proposal_receipt',
      'Recepção confirmada: ' || v_num, 'Versão ' || v_ver || ' registada.', 'proposal', v_pid, 'rcpt:' || v_pid || ':v' || v_ver);
    perform public.write_audit(v_uid, p_supplier_org, 'proposals.submit', 'proposal', v_pid,
      jsonb_build_object('versao', v_ver, 'total', v_tot, 'moeda', v_o.currency));
  end if;
  return v_pid;
end $$;

create or replace function public.withdraw_proposal(p_proposal uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_p public.proposals; v_o public.opportunities;
begin
  perform public.require_auth();
  select * into v_p from public.proposals where id = p_proposal for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v_p.supplier_org_id, 'proposal.submit');
  if v_p.status <> 'submitted' then raise exception 'INVALID_STATE_TRANSITION'; end if;
  select * into v_o from public.opportunities where id = v_p.opportunity_id;
  if now() > public.effective_deadline(v_o.id, v_p.supplier_org_id) then raise exception 'DEADLINE_PASSED'; end if;
  update public.proposals set status = 'withdrawn', withdrawn_reason = p_reason where id = p_proposal;
  update public.supplier_invitations set status = 'viewed' where opportunity_id = v_o.id and supplier_org_id = v_p.supplier_org_id;
  perform public.notify_org(v_o.buyer_org_id, 'proposal.view', 'proposal_withdrawn',
    'Proposta retirada: ' || v_p.number, p_reason, 'proposal', p_proposal, 'prop:' || p_proposal || ':wd');
end $$;

-- ------------------------------------------------- Esclarecimentos e avisos
create or replace function public.ask_clarification(p_opp uuid, p_supplier_org uuid, p_question text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_o public.opportunities; v_id uuid;
begin
  perform public.require_auth();
  perform public.require_perm(p_supplier_org, 'proposal.submit');
  perform public.check_rate_limit('ask_clarification', 20, interval '1 hour');
  select * into v_o from public.opportunities where id = p_opp;
  if not found or not public.can_view_opportunity(p_opp) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  if v_o.status not in ('open', 'clarification') then raise exception 'OPPORTUNITY_NOT_OPEN'; end if;
  insert into public.clarifications (opportunity_id, supplier_org_id, question, asked_by)
  values (p_opp, p_supplier_org, p_question, auth.uid()) returning id into v_id;
  perform public.notify_org(v_o.buyer_org_id, 'opportunity.manage', 'clarification_asked',
    'Pedido de esclarecimento: ' || v_o.number, left(p_question, 200), 'opportunity', p_opp, 'clr:' || v_id);
  return v_id;
end $$;

create or replace function public.answer_clarification(p_id uuid, p_answer text, p_publish boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_c public.clarifications; v_o public.opportunities; r record;
begin
  perform public.require_auth();
  select * into v_c from public.clarifications where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_o from public.opportunities where id = v_c.opportunity_id;
  perform public.require_perm(v_o.buyer_org_id, 'opportunity.manage');
  if length(trim(coalesce(p_answer, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  update public.clarifications set answer = p_answer, answered_by = auth.uid(), answered_at = now(),
    published_as_notice = p_publish where id = p_id;
  if p_publish then
    insert into public.opportunity_notices (opportunity_id, title, body, created_by)
    values (v_c.opportunity_id, 'Esclarecimento', 'Pergunta: ' || v_c.question || E'\nResposta: ' || p_answer, auth.uid());
    for r in select supplier_org_id from public.supplier_invitations where opportunity_id = v_o.id loop
      perform public.notify_org(r.supplier_org_id, 'opportunity.view', 'notice', 'Novo esclarecimento: ' || v_o.number,
        left(p_answer, 200), 'opportunity', v_o.id, 'notice:' || p_id || ':' || r.supplier_org_id);
    end loop;
  else
    perform public.notify_org(v_c.supplier_org_id, 'opportunity.view', 'clarification_answered',
      'Esclarecimento respondido: ' || v_o.number, left(p_answer, 200), 'opportunity', v_o.id, 'clra:' || p_id);
  end if;
end $$;

-- --------------------------------------------------------- Decisão comercial
create or replace function public.record_decision(
  p_opp uuid, p_result public.decision_result, p_proposal uuid, p_rationale text, p_amount numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_o public.opportunities; v_p public.proposals; v_id uuid; v_amount numeric; r record;
begin
  perform public.require_auth();
  select * into v_o from public.opportunities where id = p_opp for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v_o.buyer_org_id, 'opportunity.decide');
  if v_o.status not in ('under_evaluation', 'closed') then raise exception 'INVALID_STATE_TRANSITION'; end if;
  if exists (select 1 from public.commercial_decisions where opportunity_id = p_opp) then raise exception 'DECISION_ALREADY_RECORDED'; end if;
  if length(trim(coalesce(p_rationale, ''))) < 10 then raise exception 'RATIONALE_REQUIRED'; end if;
  if p_result = 'awarded' then
    select * into v_p from public.proposals where id = p_proposal and opportunity_id = p_opp
       and status in ('submitted', 'in_evaluation');
    if not found then raise exception 'INVALID_PROPOSAL'; end if;
    v_amount := coalesce(p_amount, v_p.total);
    if v_amount <= 0 then raise exception 'INVALID_AMOUNTS'; end if;
  end if;
  insert into public.commercial_decisions (opportunity_id, result, proposal_id, approved_amount, currency, rationale, decided_by)
  values (p_opp, p_result, case when p_result = 'awarded' then p_proposal end, v_amount,
          case when p_result = 'awarded' then v_o.currency end, trim(p_rationale), auth.uid())
  returning id into v_id;
  for r in select id, supplier_org_id from public.proposals where opportunity_id = p_opp and status in ('submitted', 'in_evaluation') loop
    update public.proposals set status = case when p_result = 'awarded' and r.id = p_proposal then 'selected' else 'rejected' end::public.proposal_status
     where id = r.id;
    perform public.notify_org(r.supplier_org_id, 'proposal.view', 'decision',
      case when p_result = 'awarded' and r.id = p_proposal then 'Proposta seleccionada: ' || v_o.number
           else 'Proposta não seleccionada: ' || v_o.number end,
      case when p_result = 'awarded' and r.id = p_proposal
           then 'A sua proposta foi seleccionada nesta decisão comercial. Esta decisão não constitui contrato.'
           else 'O pedido foi decidido sem selecção da sua proposta.' end,
      'proposal', r.id, 'dec:' || r.id);
  end loop;
  update public.opportunities set status = case when p_result = 'awarded' then 'awarded' else 'closed' end::public.opportunity_status,
    closed_at = coalesce(closed_at, now()) where id = p_opp;
  return v_id;
end $$;

-- ----------------------------------------------------------------- Anexos
create or replace function public.add_attachment(
  p_org uuid, p_entity_type text, p_entity_id uuid, p_path text, p_name text, p_size bigint, p_mime text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ok boolean := false;
begin
  perform public.require_auth();
  if left(p_path, 37) <> p_org::text || '/' then raise exception 'INVALID_STORAGE_PATH' using errcode = '42501'; end if;
  if p_size <= 0 or p_size > 20 * 1024 * 1024 then raise exception 'FILE_TOO_LARGE'; end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'INVALID_FILE_TYPE';
  end if;
  if p_entity_type = 'opportunity' then
    v_ok := exists (select 1 from public.opportunities o where o.id = p_entity_id and o.buyer_org_id = p_org
                    and o.status in ('draft', 'published', 'invites_sent', 'open', 'clarification'))
            and public.has_org_permission(p_org, 'opportunity.manage');
  elsif p_entity_type = 'proposal' then
    v_ok := exists (select 1 from public.proposals p where p.id = p_entity_id and p.supplier_org_id = p_org
                    and p.status in ('draft', 'submitted'))
            and public.has_org_permission(p_org, 'proposal.submit');
  end if;
  if not v_ok then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  insert into public.attachments (organization_id, entity_type, entity_id, storage_path, file_name, file_size, mime_type, uploaded_by)
  values (p_org, p_entity_type, p_entity_id, p_path, p_name, p_size, p_mime, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- --------------------------------------------------- Alertas (idempotentes)
-- Executar periodicamente (pg_cron ou Edge Function agendada). A chave de
-- deduplicação garante que cada alerta é gerado uma única vez por utilizador.
create or replace function public.generate_alerts() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; v_days int; v_thr int; v_default int[];
  v_doc_alerts int := 0; v_deadline_alerts int := 0; v_before int; v_after int; v_hours numeric; v_hthr int;
  v_hours_cfg int[];
begin
  if auth.uid() is not null and not public.is_superadmin() then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  select count(*) into v_before from public.notifications;
  select array(select jsonb_array_elements_text(public.setting('document_alert_days', '[30,15,7]'::jsonb))::int) into v_default;
  select array(select jsonb_array_elements_text(public.setting('deadline_alert_hours', '[72,24]'::jsonb))::int) into v_hours_cfg;

  for r in
    select d.id, d.organization_id, d.title, d.valid_until, d.current_version, t.alert_days
    from public.documents d join public.document_types t on t.id = d.document_type_id
    where d.status = 'approved' and d.valid_until is not null
  loop
    v_days := r.valid_until - current_date;
    if v_days < 0 then
      perform public.notify_org(r.organization_id, 'document.upload', 'document_expired',
        'Documento expirado: ' || r.title, 'Validade terminou em ' || to_char(r.valid_until, 'DD/MM/YYYY') || '. Submeta uma nova versão.',
        'document', r.id, 'doc:' || r.id || ':v' || r.current_version || ':expired');
    else
      select min(x) into v_thr from unnest(coalesce(nullif(r.alert_days, '{}'), v_default)) x where x >= v_days;
      if v_thr is not null then
        perform public.notify_org(r.organization_id, 'document.upload', 'document_expiring',
          'Documento a expirar em ' || v_days || ' dia(s): ' || r.title,
          'Validade até ' || to_char(r.valid_until, 'DD/MM/YYYY') || '.', 'document', r.id,
          'doc:' || r.id || ':v' || r.current_version || ':t' || v_thr);
      end if;
    end if;
  end loop;

  for r in select o.id, o.number, o.title, o.buyer_org_id, public.final_deadline(o.id) as dl
           from public.opportunities o where o.status in ('open', 'clarification') loop
    v_hours := extract(epoch from (r.dl - now())) / 3600;
    if v_hours < 0 then
      perform public.notify_org(r.buyer_org_id, 'opportunity.manage', 'deadline_passed',
        'Prazo terminado: ' || r.number, 'Pode passar o pedido para avaliação.', 'opportunity', r.id, 'opp:' || r.id || ':passed');
    else
      select min(x) into v_hthr from unnest(v_hours_cfg) x where x >= v_hours;
      if v_hthr is not null then
        perform public.notify_org(si.supplier_org_id, 'opportunity.view', 'deadline_near',
          'Prazo a terminar em breve: ' || r.number, r.title, 'opportunity', r.id, 'opp:' || r.id || ':h' || v_hthr)
        from public.supplier_invitations si
        where si.opportunity_id = r.id and si.status <> 'responded'
          and not exists (select 1 from public.proposals p where p.opportunity_id = r.id
                          and p.supplier_org_id = si.supplier_org_id and p.status = 'submitted');
      end if;
    end if;
  end loop;
  select count(*) into v_after from public.notifications;
  return jsonb_build_object('novas_notificacoes', v_after - v_before);
end $$;

-- ------------------------------------------------------ Administração/ferramentas
create or replace function public.bootstrap_superadmin(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if current_user in ('authenticated', 'anon') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  update public.profiles set is_superadmin = true where id = (select id from auth.users where lower(email) = lower(p_email));
  if not found then raise exception 'USER_NOT_FOUND'; end if;
end $$;

-- Factos agregados (sem valores nem textos comerciais) para o painel global.
create or replace function public.admin_opportunity_facts()
returns table (id uuid, buyer_org_id uuid, category_id uuid, status public.opportunity_status, currency text,
               visibility public.opportunity_visibility, deadline timestamptz, final_deadline timestamptz,
               published_at timestamptz, duplicate_of uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_superadmin();
  return query select o.id, o.buyer_org_id, o.category_id, o.status, o.currency, o.visibility, o.deadline,
                      public.final_deadline(o.id), o.published_at, o.duplicate_of, o.created_at
               from public.opportunities o;
end $$;

create or replace function public.admin_proposal_facts()
returns table (id uuid, opportunity_id uuid, supplier_org_id uuid, status public.proposal_status,
               submitted_at timestamptz, first_submitted_at timestamptz, validity_until date, currency text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_superadmin();
  return query select p.id, p.opportunity_id, p.supplier_org_id, p.status, p.submitted_at, p.first_submitted_at,
                      p.validity_until, p.currency from public.proposals p;
end $$;

create or replace function public.admin_decision_facts()
returns table (opportunity_id uuid, result public.decision_result, decided_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_superadmin();
  return query select c.opportunity_id, c.result, c.decided_at from public.commercial_decisions c;
end $$;

-- ----------------------------------------------------------- Permissões de execução
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- Funções de uso interno/privilegiado
revoke execute on function public.bootstrap_superadmin(text), public.write_audit(uuid, uuid, text, text, uuid, jsonb),
  public.notify(uuid, uuid, text, text, text, text, uuid, text),
  public.notify_org(uuid, text, text, text, text, text, uuid, text),
  public.notify_superadmins(text, text, text, text, uuid, text),
  public.invite_internal(uuid, uuid[], uuid) from authenticated;
-- Funções usadas por políticas RLS e pela vista pública (anónimos só vêem dados públicos)
grant execute on function public.safe_uuid(text), public.is_superadmin(), public.is_org_member(uuid),
  public.has_org_permission(uuid, text), public.org_is_listed(uuid), public.org_visible_to_me(uuid),
  public.org_shows_field(uuid, text), public.buyer_related_to_supplier(uuid, text),
  public.can_view_opportunity(uuid) to anon;

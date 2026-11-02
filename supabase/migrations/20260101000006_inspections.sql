-- =============================================================================
-- JOVEM+ BUSINESS — Mapas de inspecção (controlo de mercadorias)
-- Módulo ADITIVO: não altera tabelas nem políticas existentes.
-- =============================================================================
create type public.inspection_status as enum ('draft', 'submitted', 'approved', 'returned');
create sequence public.inspection_seq;

create table public.inspection_maps (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (
    'MCI-' || to_char(now() at time zone 'Africa/Luanda', 'YYYY') || '-' || lpad(nextval('public.inspection_seq')::text, 5, '0')),
  organization_id uuid not null references public.organizations (id),
  title text not null check (length(trim(title)) >= 3),
  vessel_name text, voyage_ref text, bl_ref text, port_location text,
  cargo_description text, cargo_owner text,
  inspection_date date not null default ((now() at time zone 'Africa/Luanda')::date),
  -- Tolerância de diferença (%). Valor inicial configurável por mapa; não é uma norma.
  tolerance_pct numeric(5, 2) not null default 0.5 check (tolerance_pct between 0 and 100),
  inspector_id uuid references public.profiles (id),
  status public.inspection_status not null default 'draft',
  notes text,
  submitted_at timestamptz, reviewed_by uuid references public.profiles (id), reviewed_at timestamptz, review_note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index inspection_maps_org_idx on public.inspection_maps (organization_id, status, inspection_date desc);

-- Linhas com colunas CALCULADAS no servidor (o cliente não as escreve):
--   diff = contada − declarada | boa = contada − avariada
--   diff% = arred(diff ÷ declarada × 100, 2) (nulo sem declarada) | peso = arred(boa × peso unitário, 3)
create table public.inspection_map_lines (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.inspection_maps (id) on delete cascade,
  position int not null,
  hold_ref text, item_description text not null check (length(trim(item_description)) >= 2),
  lot_ref text, unit text not null default 'un',
  declared_qty numeric(14, 3) not null default 0 check (declared_qty >= 0),
  counted_qty numeric(14, 3) not null default 0 check (counted_qty >= 0),
  damaged_qty numeric(14, 3) not null default 0 check (damaged_qty >= 0),
  unit_weight_kg numeric(14, 4) check (unit_weight_kg is null or unit_weight_kg >= 0),
  condition text, notes text,
  diff_qty numeric(16, 3) generated always as (counted_qty - declared_qty) stored,
  good_qty numeric(16, 3) generated always as (counted_qty - damaged_qty) stored,
  diff_pct numeric(12, 2) generated always as (case when declared_qty > 0 then round((counted_qty - declared_qty) * 100 / declared_qty, 2) end) stored,
  line_weight_kg numeric(18, 3) generated always as (case when unit_weight_kg is null then null else round((counted_qty - damaged_qty) * unit_weight_kg, 3) end) stored,
  check (damaged_qty <= counted_qty),
  unique (map_id, position)
);

create trigger inspection_maps_set_updated_at before update on public.inspection_maps for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- Permissões
insert into public.roles (code, name, description, scope) values
  ('inspector', 'Inspector', 'Preenche mapas de inspecção e regista digitalizações no terreno, em dispositivo móvel.', 'organization');
insert into public.permissions (code, description) values
  ('inspection.view', 'Consultar mapas de inspecção'), ('inspection.create', 'Criar e preencher mapas de inspecção'),
  ('inspection.review', 'Aprovar ou devolver mapas de inspecção'),
  ('scan.view', 'Consultar digitalizações 3D e validações'), ('scan.capture', 'Registar digitalizações 3D'),
  ('scan.validate', 'Registar medições de validação de precisão');
insert into public.role_permissions (role, permission) values
  ('org_admin','inspection.view'), ('org_admin','inspection.create'), ('org_admin','inspection.review'),
  ('org_admin','scan.view'), ('org_admin','scan.capture'), ('org_admin','scan.validate'),
  ('inspector','org.view'), ('inspector','inspection.view'), ('inspector','inspection.create'), ('inspector','report.view'),
  ('inspector','scan.view'), ('inspector','scan.capture'), ('inspector','scan.validate'),
  ('auditor','inspection.view'), ('auditor','scan.view'),
  ('procurement_qualifier','inspection.view'), ('procurement_qualifier','inspection.review'), ('procurement_qualifier','scan.view'),
  ('buyer','inspection.view');

-- ------------------------------------------------------------------- RLS
alter table public.inspection_maps enable row level security;
alter table public.inspection_map_lines enable row level security;
revoke all on public.inspection_maps, public.inspection_map_lines from anon, authenticated;
revoke all on sequence public.inspection_seq from anon, authenticated;
grant select on public.inspection_maps, public.inspection_map_lines to authenticated;
grant insert (organization_id, title, vessel_name, voyage_ref, bl_ref, port_location, cargo_description, cargo_owner, inspection_date, tolerance_pct, inspector_id, notes, created_by)
  on public.inspection_maps to authenticated;
grant update (title, vessel_name, voyage_ref, bl_ref, port_location, cargo_description, cargo_owner, inspection_date, tolerance_pct, inspector_id, notes)
  on public.inspection_maps to authenticated;
grant insert (map_id, position, hold_ref, item_description, lot_ref, unit, declared_qty, counted_qty, damaged_qty, unit_weight_kg, condition, notes),
      update (position, hold_ref, item_description, lot_ref, unit, declared_qty, counted_qty, damaged_qty, unit_weight_kg, condition, notes),
      delete on public.inspection_map_lines to authenticated;
grant usage on sequence public.inspection_seq to authenticated;

create or replace function public.inspection_map_editable(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inspection_maps m
    where m.id = p_map and m.status in ('draft', 'returned')
      and public.has_org_permission(m.organization_id, 'inspection.create')
      and (m.created_by = auth.uid() or m.inspector_id = auth.uid() or public.has_org_permission(m.organization_id, 'inspection.review')))
$$;
create or replace function public.inspection_map_visible(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inspection_maps m where m.id = p_map and public.has_org_permission(m.organization_id, 'inspection.view'))
$$;

create policy inspection_maps_select on public.inspection_maps for select to authenticated
  using (public.has_org_permission(organization_id, 'inspection.view'));
create policy inspection_maps_insert on public.inspection_maps for insert to authenticated
  with check (public.has_org_permission(organization_id, 'inspection.create') and created_by = auth.uid()
              and (inspector_id is null or public.is_org_member(organization_id)));
create policy inspection_maps_update on public.inspection_maps for update to authenticated
  using (public.inspection_map_editable(id)) with check (public.inspection_map_editable(id));
create policy inspection_lines_select on public.inspection_map_lines for select to authenticated
  using (public.inspection_map_visible(map_id));
create policy inspection_lines_write on public.inspection_map_lines for all to authenticated
  using (public.inspection_map_editable(map_id)) with check (public.inspection_map_editable(map_id));

-- -------------------------------------------------------- Auditoria + RPCs
create or replace function public.audit_org_of(p_table text, p_row jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  return case p_table
    when 'organizations' then (p_row->>'id')::uuid
    when 'organization_members' then (p_row->>'organization_id')::uuid
    when 'documents' then (p_row->>'organization_id')::uuid
    when 'services' then (p_row->>'organization_id')::uuid
    when 'inspection_maps' then (p_row->>'organization_id')::uuid
    when 'opportunities' then (p_row->>'buyer_org_id')::uuid
    when 'proposals' then (p_row->>'supplier_org_id')::uuid
    when 'document_reviews' then (select organization_id from public.documents where id = (p_row->>'document_id')::uuid)
    when 'commercial_decisions' then (select buyer_org_id from public.opportunities where id = (p_row->>'opportunity_id')::uuid)
    when 'deadline_extensions' then (select buyer_org_id from public.opportunities where id = (p_row->>'opportunity_id')::uuid)
    when 'supplier_invitations' then (select buyer_org_id from public.opportunities where id = (p_row->>'opportunity_id')::uuid)
    else null end;
end $$;
create trigger inspection_maps_audit after insert or update or delete on public.inspection_maps for each row execute function public.audit_row();

create or replace function public.submit_inspection_map(p_map uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.inspection_maps;
begin
  perform public.require_auth();
  select * into v from public.inspection_maps where id = p_map for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v.organization_id, 'inspection.create');
  if v.created_by is distinct from auth.uid() and v.inspector_id is distinct from auth.uid() then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if v.status not in ('draft', 'returned') then raise exception 'INVALID_STATE_TRANSITION'; end if;
  if not exists (select 1 from public.inspection_map_lines where map_id = p_map) then raise exception 'LINES_REQUIRED'; end if;
  update public.inspection_maps set status = 'submitted', submitted_at = now(), reviewed_by = null, reviewed_at = null,
    review_note = null, inspector_id = coalesce(inspector_id, auth.uid()) where id = p_map;
  perform public.notify_org(v.organization_id, 'inspection.review', 'inspection_submitted', 'Mapa de inspecção submetido: ' || v.number,
    v.title, 'inspection', p_map, 'insp:' || p_map || ':' || extract(epoch from now())::bigint);
end $$;

create or replace function public.review_inspection_map(p_map uuid, p_result text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.inspection_maps;
begin
  perform public.require_auth();
  select * into v from public.inspection_maps where id = p_map for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.require_perm(v.organization_id, 'inspection.review');
  if p_result not in ('approved', 'returned') then raise exception 'INVALID_STATE_TRANSITION'; end if;
  if v.status <> 'submitted' then raise exception 'INVALID_STATE_TRANSITION'; end if;
  -- Segregação de funções: quem preencheu ou submeteu não aprova o próprio mapa.
  if v.created_by = auth.uid() or v.inspector_id = auth.uid() then raise exception 'CANNOT_REVIEW_OWN_MAP' using errcode = '42501'; end if;
  if p_result = 'returned' and length(trim(coalesce(p_note, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;
  update public.inspection_maps set status = p_result::public.inspection_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_map;
  perform public.notify(coalesce(v.inspector_id, v.created_by), v.organization_id, 'inspection_' || p_result,
    case p_result when 'approved' then 'Mapa aprovado: ' else 'Mapa devolvido: ' end || v.number, p_note, 'inspection', p_map);
end $$;
revoke execute on function public.submit_inspection_map(uuid), public.review_inspection_map(uuid, text, text) from public, anon;
grant execute on function public.submit_inspection_map(uuid), public.review_inspection_map(uuid, text, text) to authenticated, service_role;

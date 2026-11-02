-- =============================================================================
-- JOVEM+ SMART HOLD SCAN — digitalizações 3D e validação de precisão (protótipo)
-- Módulo ADITIVO. Nenhuma medição é «validada» por defeito: a validação é calculada a partir de registos.
-- =============================================================================
create table public.hold_scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  inspection_map_id uuid references public.inspection_maps (id),
  title text not null check (length(trim(title)) >= 3),
  hold_ref text,
  method text not null check (method in ('webxr_hit_test', 'webxr_depth', 'imported_model', 'simulated', 'manual')),
  device jsonb not null default '{}',            -- modelo, navegador, sensores detectados
  stats jsonb not null default '{}',             -- nº de pontos, dimensões estimadas, etc.
  model_path text unique,                        -- ficheiro no bucket privado "scans"
  model_format text check (model_format in ('ply', 'obj', 'glb', 'json')),
  model_bytes bigint,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index hold_scans_org_idx on public.hold_scans (organization_id, created_at desc);

-- Registos de validação: imutáveis (sem UPDATE/DELETE). Cada linha compara UMA dimensão física conhecida.
create table public.scan_validations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  scan_id uuid references public.hold_scans (id),
  device_label text not null check (length(trim(device_label)) >= 2),
  method text not null check (method in ('webxr_hit_test', 'webxr_depth', 'imported_model', 'simulated', 'manual')),
  reference_label text not null check (length(trim(reference_label)) >= 2),
  physical_value numeric(12, 4) not null check (physical_value > 0),   -- metros (trena/medidor laser)
  physical_instrument text,
  physical_uncertainty numeric(10, 4) check (physical_uncertainty is null or physical_uncertainty >= 0),
  scanned_value numeric(12, 4) not null check (scanned_value > 0),     -- metros
  conditions text,
  measured_by uuid not null references public.profiles (id),
  measured_at timestamptz not null default now(),
  error_abs numeric(12, 4) generated always as (scanned_value - physical_value) stored,
  error_pct numeric(12, 3) generated always as (round((scanned_value - physical_value) * 100 / physical_value, 3)) stored
);
create index scan_validations_org_idx on public.scan_validations (organization_id, device_label, method);
create trigger scan_validations_immutable before update or delete on public.scan_validations for each row execute function public.block_mutation();

alter table public.hold_scans enable row level security;
alter table public.scan_validations enable row level security;
revoke all on public.hold_scans, public.scan_validations from anon, authenticated;
grant select on public.hold_scans, public.scan_validations to authenticated;
grant insert (organization_id, inspection_map_id, title, hold_ref, method, device, stats, model_path, model_format, model_bytes, notes, created_by) on public.hold_scans to authenticated;
grant update (title, hold_ref, notes) on public.hold_scans to authenticated;
grant insert (organization_id, scan_id, device_label, method, reference_label, physical_value, physical_instrument, physical_uncertainty, scanned_value, conditions, measured_by)
  on public.scan_validations to authenticated;

create policy hold_scans_select on public.hold_scans for select to authenticated using (public.has_org_permission(organization_id, 'scan.view'));
create policy hold_scans_insert on public.hold_scans for insert to authenticated
  with check (public.has_org_permission(organization_id, 'scan.capture') and created_by = auth.uid()
    and (inspection_map_id is null or exists (select 1 from public.inspection_maps m where m.id = inspection_map_id and m.organization_id = hold_scans.organization_id)));
create policy hold_scans_update on public.hold_scans for update to authenticated
  using (created_by = auth.uid() and public.has_org_permission(organization_id, 'scan.capture'))
  with check (created_by = auth.uid() and public.has_org_permission(organization_id, 'scan.capture'));
create policy scan_validations_select on public.scan_validations for select to authenticated using (public.has_org_permission(organization_id, 'scan.view'));
create policy scan_validations_insert on public.scan_validations for insert to authenticated
  with check (public.has_org_permission(organization_id, 'scan.validate') and measured_by = auth.uid());

-- Armazenamento privado dos modelos 3D: {organization_id}/{scan}/ficheiro
insert into storage.buckets (id, name, public, file_size_limit) values ('scans', 'scans', false, 157286400) on conflict (id) do update set public = false;
create policy storage_scans_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'scans' and public.has_org_permission(public.safe_uuid((storage.foldername(name))[1]), 'scan.capture'));
create policy storage_scans_select on storage.objects for select to authenticated
  using (bucket_id = 'scans' and exists (select 1 from public.hold_scans s where s.model_path = storage.objects.name and public.has_org_permission(s.organization_id, 'scan.view')));

-- (a auditoria de hold_scans usa audit_row; a organização é resolvida abaixo)
create or replace function public.audit_org_of(p_table text, p_row jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  return case when p_table in ('organization_members','documents','services','inspection_maps','hold_scans') then (p_row->>'organization_id')::uuid
    when p_table = 'organizations' then (p_row->>'id')::uuid
    when p_table = 'opportunities' then (p_row->>'buyer_org_id')::uuid
    when p_table = 'proposals' then (p_row->>'supplier_org_id')::uuid
    when p_table = 'document_reviews' then (select organization_id from public.documents where id = (p_row->>'document_id')::uuid)
    when p_table in ('commercial_decisions','deadline_extensions','supplier_invitations') then (select buyer_org_id from public.opportunities where id = (p_row->>'opportunity_id')::uuid)
    else null end;
end $$;
create trigger hold_scans_audit after insert or update or delete on public.hold_scans for each row execute function public.audit_row();

-- Critérios PROVISÓRIOS (a definir com a direcção técnica): sem eles nada é considerado validado.
insert into public.platform_settings (key, value, description) values
  ('scan_validation_criteria', '{"min_samples":10,"min_distinct_scans":3,"max_mean_abs_error_pct":1.0,"max_single_error_pct":2.0,"provisional":true}',
   'Critérios mínimos para considerar uma combinação dispositivo+método validada. PROVISÓRIOS: não são norma.');

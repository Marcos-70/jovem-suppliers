-- =============================================================================
-- JOVEM+ SUPPLIERS — Migração 001: esquema relacional
-- Todas as tabelas têm RLS activada na migração 002. Nada é eliminado
-- automaticamente: os dados são arquivados/substituídos, não apagados.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- Enumerações
create type public.app_role as enum (
  'superadmin', 'org_admin', 'supplier', 'buyer',
  'procurement_qualifier', 'doc_operator', 'auditor'
);
create type public.org_type as enum ('supplier', 'buyer', 'both');
create type public.profile_status as enum (
  'draft', 'incomplete', 'submitted', 'under_review',
  'approved', 'corrections_pending', 'suspended', 'rejected'
);
create type public.verification_status as enum ('not_verified', 'in_progress', 'verified');
create type public.org_visibility as enum ('private', 'platform', 'public');
create type public.doc_status as enum (
  'submitted', 'under_review', 'approved', 'correction_pending', 'rejected', 'superseded'
);
create type public.review_result as enum ('approved', 'rejected', 'correction_requested');
create type public.opportunity_status as enum (
  'draft', 'published', 'invites_sent', 'open', 'under_evaluation',
  'clarification', 'closed', 'awarded', 'cancelled', 'archived'
);
create type public.opportunity_visibility as enum ('invited_only', 'open_to_qualified');
create type public.invitation_status as enum ('sent', 'viewed', 'declined', 'responded');
create type public.proposal_status as enum (
  'draft', 'submitted', 'in_evaluation', 'withdrawn', 'rejected', 'selected'
);
create type public.decision_result as enum ('awarded', 'no_award');
create type public.criterion_type as enum ('technical', 'commercial');

-- ---------------------------------------------------------------- Utilitários
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create sequence public.opportunity_seq;
create sequence public.proposal_seq;

-- ------------------------------------------------------- Utilizadores e perfis
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  job_title text,
  is_superadmin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  code public.app_role primary key,
  name text not null,
  description text not null,
  scope text not null check (scope in ('platform', 'organization'))
);

create table public.permissions (
  code text primary key,
  description text not null
);

create table public.role_permissions (
  role public.app_role not null references public.roles (code) on delete cascade,
  permission text not null references public.permissions (code) on delete cascade,
  primary key (role, permission)
);

-- -------------------------------------------------------------- Organizações
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) >= 2),
  trade_name text,
  nif text not null,
  commercial_registry text,
  org_type public.org_type not null default 'supplier',
  sector text,
  province text,
  municipality text,
  address text,
  phone text,
  email text,
  website text,
  contact_person text,
  description text,
  founded_year int check (founded_year between 1900 and 2100),
  employee_count int check (employee_count >= 0),
  capabilities text,
  certifications_declared text[] not null default '{}',
  profile_status public.profile_status not null default 'draft',
  profile_review_reason text,
  verification_status public.verification_status not null default 'not_verified',
  verification_scope text,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  visibility public.org_visibility not null default 'private',
  visibility_consent_at timestamptz,
  public_fields text[] not null default '{}',
  is_active boolean not null default true,
  submitted_at timestamptz,
  profile_updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_nif_unique unique (nif),
  constraint organizations_verified_scope check (
    verification_status <> 'verified' or (verification_scope is not null and verified_at is not null)
  ),
  constraint organizations_public_fields_allowed check (
    public_fields <@ array['nif','address','phone','email','website','contact_person',
                           'employee_count','capabilities','certifications','compliance']::text[]
  )
);
create index organizations_status_idx on public.organizations (profile_status, is_active);
create index organizations_province_idx on public.organizations (province, municipality);
create index organizations_name_trgm on public.organizations
  using gin ((lower(legal_name || ' ' || coalesce(trade_name, ''))) extensions.gin_trgm_ops);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null check (role <> 'superadmin'),
  is_active boolean not null default true,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, role)
);
create index organization_members_user_idx on public.organization_members (user_id) where is_active;
create index organization_members_org_idx on public.organization_members (organization_id) where is_active;

-- ------------------------------------------------- Categorias e serviços
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id),
  name text not null,
  slug text not null unique,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  name text not null check (length(trim(name)) >= 2),
  description text,
  specialties text[] not null default '{}',
  areas text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_org_idx on public.services (organization_id);
create index services_category_idx on public.services (category_id);

-- ---------------------------------------------------- Tipos documentais e requisitos
create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  requires_expiry boolean not null default false,
  alert_days int[] not null default '{30,15,7}',
  max_size_mb int not null default 10 check (max_size_mb between 1 and 50),
  allowed_mime text[] not null default '{application/pdf,image/jpeg,image/png}',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qualification_requirements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  document_type_id uuid not null references public.document_types (id),
  category_id uuid references public.categories (id),
  min_validity_days int not null default 0 check (min_validity_days >= 0),
  is_mandatory boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Documentos
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_type_id uuid not null references public.document_types (id),
  title text not null,
  current_version int not null default 1,
  reference_number text,
  issue_date date,
  valid_until date,
  status public.doc_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_reason text,
  file_name text not null,
  file_size bigint not null,
  mime_type text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or issue_date is null or valid_until >= issue_date)
);
create index documents_org_idx on public.documents (organization_id, status);
create index documents_validity_idx on public.documents (valid_until) where status = 'approved';

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version int not null,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint not null,
  mime_type text not null,
  reference_number text,
  issue_date date,
  valid_until date,
  status public.doc_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id),
  unique (document_id, version)
);

create table public.document_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version_id uuid not null references public.document_versions (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id),
  result public.review_result not null,
  reason text,
  reviewed_at timestamptz not null default now(),
  check (result = 'approved' or length(trim(coalesce(reason, ''))) >= 3)
);
create index document_reviews_doc_idx on public.document_reviews (document_id);

-- -------------------------------------------------- Oportunidades e cotações
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (
    'RFQ-' || to_char(now() at time zone 'Africa/Luanda', 'YYYY') || '-' ||
    lpad(nextval('public.opportunity_seq')::text, 5, '0')
  ),
  buyer_org_id uuid not null references public.organizations (id),
  title text not null check (length(trim(title)) >= 3),
  description text,
  category_id uuid references public.categories (id),
  responsible_id uuid references public.profiles (id),
  delivery_location text,
  deadline timestamptz not null,
  currency text not null default 'AOA' check (currency ~ '^[A-Z]{3}$'),
  commercial_terms text,
  technical_requirements text,
  required_document_type_ids uuid[] not null default '{}',
  visibility public.opportunity_visibility not null default 'invited_only',
  sealed_until_deadline boolean not null default true,
  status public.opportunity_status not null default 'draft',
  duplicate_of uuid references public.opportunities (id),
  published_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_buyer_idx on public.opportunities (buyer_org_id, status);
create index opportunities_status_idx on public.opportunities (status, deadline);

create table public.opportunity_items (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  position int not null,
  description text not null check (length(trim(description)) >= 2),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null default 'un',
  technical_spec text,
  unique (opportunity_id, position)
);

create table public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  position int not null,
  name text not null,
  description text,
  weight numeric(5, 2) not null check (weight > 0 and weight <= 100),
  kind public.criterion_type not null default 'technical',
  unique (opportunity_id, position)
);

create table public.deadline_extensions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  supplier_org_id uuid references public.organizations (id),
  previous_deadline timestamptz not null,
  new_deadline timestamptz not null,
  reason text not null check (length(trim(reason)) >= 5),
  authorized_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (new_deadline > previous_deadline)
);
create index deadline_extensions_opp_idx on public.deadline_extensions (opportunity_id);

create table public.supplier_invitations (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  supplier_org_id uuid not null references public.organizations (id),
  invited_by uuid references public.profiles (id),
  status public.invitation_status not null default 'sent',
  invited_at timestamptz not null default now(),
  viewed_at timestamptz,
  responded_at timestamptz,
  unique (opportunity_id, supplier_org_id)
);
create index supplier_invitations_supplier_idx on public.supplier_invitations (supplier_org_id);

create table public.clarifications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  supplier_org_id uuid not null references public.organizations (id),
  question text not null check (length(trim(question)) >= 5),
  asked_by uuid references public.profiles (id),
  asked_at timestamptz not null default now(),
  answer text,
  answered_by uuid references public.profiles (id),
  answered_at timestamptz,
  published_as_notice boolean not null default false
);
create index clarifications_opp_idx on public.clarifications (opportunity_id);

create table public.opportunity_notices (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- Propostas
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (
    'PRP-' || to_char(now() at time zone 'Africa/Luanda', 'YYYY') || '-' ||
    lpad(nextval('public.proposal_seq')::text, 5, '0')
  ),
  opportunity_id uuid not null references public.opportunities (id),
  supplier_org_id uuid not null references public.organizations (id),
  current_version int not null default 0,
  status public.proposal_status not null default 'draft',
  submitted_at timestamptz,
  first_submitted_at timestamptz,
  receipt_code text,
  receipt_confirmed_at timestamptz,
  validity_until date,
  delivery_days int check (delivery_days is null or delivery_days >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  commercial_terms text,
  notes text,
  subtotal numeric(18, 2) not null default 0,
  discount_total numeric(18, 2) not null default 0,
  tax_total numeric(18, 2) not null default 0,
  total numeric(18, 2) not null default 0,
  withdrawn_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, supplier_org_id)
);
create index proposals_supplier_idx on public.proposals (supplier_org_id, status);

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  opportunity_item_id uuid not null references public.opportunity_items (id),
  description text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(18, 2) not null check (unit_price >= 0),
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  tax_pct numeric(5, 2) not null default 0 check (tax_pct between 0 and 100),
  line_gross numeric(18, 2) not null,
  line_discount numeric(18, 2) not null,
  line_subtotal numeric(18, 2) not null,
  line_tax numeric(18, 2) not null,
  line_total numeric(18, 2) not null,
  unique (proposal_id, opportunity_item_id)
);

create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  total numeric(18, 2) not null,
  currency text not null,
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz not null default now(),
  unique (proposal_id, version)
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  criterion_id uuid not null references public.evaluation_criteria (id) on delete cascade,
  evaluator_id uuid not null references public.profiles (id),
  score numeric(4, 2) not null check (score between 0 and 10),
  comment text,
  evaluated_at timestamptz not null default now(),
  unique (proposal_id, criterion_id, evaluator_id)
);

create table public.commercial_decisions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities (id),
  result public.decision_result not null,
  proposal_id uuid references public.proposals (id),
  approved_amount numeric(18, 2),
  currency text,
  rationale text not null check (length(trim(rationale)) >= 10),
  decided_by uuid not null references public.profiles (id),
  decided_at timestamptz not null default now(),
  check (result <> 'awarded' or (proposal_id is not null and approved_amount is not null and currency is not null))
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('opportunity', 'proposal')),
  entity_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint not null,
  mime_type text not null,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);

-- ------------------------------------------- Notificações, auditoria, definições
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  read_at timestamptz,
  email_status text not null default 'not_configured'
    check (email_status in ('not_configured', 'pending', 'sent', 'failed', 'disabled')),
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  primary key (user_id, type)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  organization_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_idx on public.rate_limit_events (user_id, action, created_at desc);

-- Gatilhos updated_at
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','organizations','organization_members','categories','services','document_types',
    'qualification_requirements','documents','opportunities','proposals'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;

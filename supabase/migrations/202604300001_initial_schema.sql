begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists private;

do $$
begin
  create type public.app_role as enum ('admin', 'partner');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.task_type as enum ('survey', 'installation', 'repair');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pipeline_key as enum ('autopsia', 'leitourgies_inwn', 'syntirisi_loipes');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.task_status as enum (
    'unassigned',
    'assigned',
    'scheduled',
    'in_progress',
    'completed_with_pending',
    'pending_validation',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.service_provider as enum ('cosmote', 'other');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.photo_category as enum ('before', 'after', 'equipment', 'wiring');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.safety_status as enum ('ok', 'warning', 'needs-review');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.fiber_stage_key as enum (
    'xwmatourgiko',
    'emfyteysh',
    'entos_ktiriou',
    'energopoiisi',
    'epimetrisi_email'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  role public.app_role not null,
  display_name text not null,
  company_name text,
  title text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text not null default '';

create table if not exists public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null unique,
  code text not null,
  description text not null,
  unit text not null default 'τεμ.',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, description, unit)
);

create table if not exists public.work_catalog (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null unique,
  article text not null,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article, description)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text not null unique,
  title text not null,
  task_type public.task_type not null default 'survey',
  pipeline public.pipeline_key not null default 'autopsia',
  status public.task_status not null default 'unassigned',
  service_provider public.service_provider not null default 'other',
  current_fiber_stage_key public.fiber_stage_key,
  address text not null default '',
  city text not null default '',
  customer_name text not null default '',
  mobile_phone text not null default '',
  landline_phone text not null default '',
  sr_id text not null default '',
  bid text not null default '',
  project_name text not null default '',
  resource_team text not null default '',
  assigned_user_id uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  start_date timestamptz,
  end_date timestamptz,
  completed_at timestamptz,
  admin_notes text not null default '',
  partner_notes text not null default '',
  api_status text not null default 'LOCAL-ONLY',
  validation_lock boolean not null default false,
  open_issues boolean not null default false,
  smart_readiness text not null default 'Σε αναμονή',
  pending_document_reason text not null default '',
  cancellation_requested boolean not null default false,
  cancellation_requested_at timestamptz,
  cancellation_requested_by uuid references public.profiles (id) on delete set null,
  cancellation_reason text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_fiber_stage_pipeline_chk check (
    (pipeline = 'leitourgies_inwn' and current_fiber_stage_key is not null)
    or
    (pipeline <> 'leitourgies_inwn' and current_fiber_stage_key is null)
  )
);

create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  summary text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.task_pipeline_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  pipeline public.pipeline_key not null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_by_name text not null,
  completed_at timestamptz not null default now()
);

create table if not exists public.task_fiber_stage_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  stage public.fiber_stage_key not null,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_by_name text not null,
  skipped boolean not null default false,
  completed_at timestamptz not null default now()
);

create table if not exists public.task_photos (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  name text not null,
  category public.photo_category not null default 'before',
  storage_path text not null,
  preview_url text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  name text not null,
  document_kind text not null default 'general',
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.task_materials (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  material_catalog_id uuid references public.material_catalog (id) on delete restrict,
  code_snapshot text not null,
  description_snapshot text not null,
  unit_snapshot text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_work_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  work_catalog_id uuid references public.work_catalog (id) on delete restrict,
  article_snapshot text not null,
  description_snapshot text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_safety_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  item text not null,
  status public.safety_status not null default 'needs-review',
  note text not null default '',
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_audit_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  source_table text not null,
  source_record_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default 'System',
  changed_fields jsonb not null default '{}'::jsonb,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_pipeline_status on public.tasks (pipeline, status);
create index if not exists idx_tasks_assigned_user on public.tasks (assigned_user_id);
create index if not exists idx_tasks_city on public.tasks (city);
create index if not exists idx_tasks_sr_id on public.tasks (sr_id);
create index if not exists idx_tasks_bid on public.tasks (bid);
create unique index if not exists idx_profiles_email_unique on public.profiles (lower(email))
  where email <> '';
create index if not exists idx_tasks_search_trgm on public.tasks
  using gin ((coalesce(title, '') || ' ' || coalesce(address, '') || ' ' || coalesce(city, '') || ' ' || coalesce(sr_id, '') || ' ' || coalesce(bid, '') || ' ' || coalesce(project_name, '') || ' ' || coalesce(customer_name, '')) gin_trgm_ops);

create index if not exists idx_task_history_task_id on public.task_history (task_id, created_at desc);
create index if not exists idx_task_pipeline_history_task_id on public.task_pipeline_history (task_id, completed_at desc);
create index if not exists idx_task_fiber_stage_history_task_id on public.task_fiber_stage_history (task_id, completed_at desc);
create index if not exists idx_task_photos_task_id on public.task_photos (task_id, uploaded_at desc);
create index if not exists idx_task_files_task_id on public.task_files (task_id, uploaded_at desc);
create index if not exists idx_task_materials_task_id on public.task_materials (task_id, created_at desc);
create index if not exists idx_task_work_items_task_id on public.task_work_items (task_id, created_at desc);
create index if not exists idx_task_safety_items_task_id on public.task_safety_items (task_id, position);
create index if not exists idx_task_audit_log_task_id on public.task_audit_log (task_id, created_at desc);
create index if not exists idx_task_audit_log_source on public.task_audit_log (source_table, source_record_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_task_state()
returns trigger
language plpgsql
as $$
begin
  if new.pipeline = 'leitourgies_inwn' and new.current_fiber_stage_key is null then
    new.current_fiber_stage_key = 'xwmatourgiko';
  end if;

  if new.pipeline <> 'leitourgies_inwn' then
    new.current_fiber_stage_key = null;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at = now();
  end if;

  if new.status <> 'completed' then
    new.completed_at = null;
  end if;

  if new.assigned_user_id is null then
    new.assigned_at = null;
  end if;

  if new.cancellation_requested = false then
    new.cancellation_requested_at = null;
    new.cancellation_requested_by = null;
    new.cancellation_reason = '';
  end if;

  return new;
end;
$$;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile public.profiles%rowtype;
  raw_role text;
  resolved_role public.app_role;
  resolved_display_name text;
  resolved_company_name text;
  resolved_title text;
  resolved_phone text;
begin
  select *
  into existing_profile
  from public.profiles
  where id = new.id;

  raw_role := lower(nullif(trim(new.raw_user_meta_data ->> 'role'), ''));

  resolved_role := coalesce(
    case raw_role
      when 'admin' then 'admin'::public.app_role
      when 'partner' then 'partner'::public.app_role
      else null
    end,
    existing_profile.role,
    'partner'::public.app_role
  );

  resolved_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(existing_profile.display_name), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  resolved_company_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
    nullif(trim(existing_profile.company_name), ''),
    resolved_display_name
  );

  resolved_title := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'title'), ''),
    nullif(trim(existing_profile.title), ''),
    case resolved_role
      when 'admin' then 'Administrator'
      else 'Field Partner'
    end
  );

  resolved_phone := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(trim(existing_profile.phone), ''),
    coalesce(new.phone, '')
  );

  insert into public.profiles (
    id,
    email,
    role,
    display_name,
    company_name,
    title,
    phone,
    is_active
  )
  values (
    new.id,
    coalesce(new.email, ''),
    resolved_role,
    resolved_display_name,
    resolved_company_name,
    resolved_title,
    resolved_phone,
    true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    display_name = excluded.display_name,
    company_name = excluded.company_name,
    title = excluded.title,
    phone = excluded.phone,
    is_active = true,
    updated_at = now();

  return new;
end;
$$;

create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.profile_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select display_name
      from public.profiles
      where id = p_user_id
    ),
    'System'
  );
$$;

create or replace function private.jsonb_diff(
  p_old jsonb,
  p_new jsonb,
  p_ignored_keys text[] default array[]::text[]
)
returns jsonb
language sql
immutable
as $$
  with all_keys as (
    select key
    from jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) as old_keys(key)
    union
    select key
    from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) as new_keys(key)
  )
  select coalesce(
    jsonb_object_agg(
      key,
      jsonb_build_object(
        'before', p_old -> key,
        'after', p_new -> key
      )
    ),
    '{}'::jsonb
  )
  from all_keys
  where not (key = any(coalesce(p_ignored_keys, array[]::text[])))
    and (p_old -> key) is distinct from (p_new -> key);
$$;

create or replace function private.capture_task_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  row_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  resolved_task_id uuid;
  resolved_record_id uuid;
  resolved_actor_id uuid;
  resolved_actor_name text := 'System';
  changed jsonb := '{}'::jsonb;
  candidate_actor_id uuid;
begin
  if tg_table_name = 'tasks' then
    resolved_task_id := coalesce(new.id, old.id);
  else
    resolved_task_id := coalesce(new.task_id, old.task_id);
  end if;

  resolved_record_id := coalesce(new.id, old.id);

  resolved_actor_id := auth.uid();

  if resolved_actor_id is null then
    candidate_actor_id := coalesce(
      private.try_uuid(coalesce(row_after ->> 'updated_by', row_before ->> 'updated_by')),
      private.try_uuid(coalesce(row_after ->> 'created_by', row_before ->> 'created_by')),
      private.try_uuid(coalesce(row_after ->> 'uploaded_by', row_before ->> 'uploaded_by')),
      private.try_uuid(coalesce(row_after ->> 'completed_by', row_before ->> 'completed_by')),
      private.try_uuid(coalesce(row_after ->> 'approved_by', row_before ->> 'approved_by')),
      private.try_uuid(coalesce(row_after ->> 'actor_id', row_before ->> 'actor_id'))
    );

    resolved_actor_id := candidate_actor_id;
  end if;

  if resolved_actor_id is not null then
    resolved_actor_name := private.profile_display_name(resolved_actor_id);
  end if;

  if tg_op = 'UPDATE' then
    changed := private.jsonb_diff(row_before, row_after, array['updated_at']);

    if changed = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    changed := private.jsonb_diff('{}'::jsonb, row_after, array[]::text[]);
  else
    changed := private.jsonb_diff(row_before, '{}'::jsonb, array[]::text[]);
  end if;

  insert into public.task_audit_log (
    task_id,
    source_table,
    source_record_id,
    operation,
    actor_id,
    actor_name,
    changed_fields,
    before_state,
    after_state
  )
  values (
    resolved_task_id,
    tg_table_name,
    resolved_record_id,
    tg_op,
    resolved_actor_id,
    resolved_actor_name,
    changed,
    row_before,
    row_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_material_catalog_updated_at on public.material_catalog;
create trigger set_material_catalog_updated_at
before update on public.material_catalog
for each row
execute function public.set_updated_at();

drop trigger if exists set_work_catalog_updated_at on public.work_catalog;
create trigger set_work_catalog_updated_at
before update on public.work_catalog
for each row
execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

drop trigger if exists sync_tasks_state on public.tasks;
create trigger sync_tasks_state
before insert or update on public.tasks
for each row
execute function public.sync_task_state();

drop trigger if exists set_task_safety_items_updated_at on public.task_safety_items;
create trigger set_task_safety_items_updated_at
before update on public.task_safety_items
for each row
execute function public.set_updated_at();

drop trigger if exists sync_profile_from_auth_user on auth.users;
create trigger sync_profile_from_auth_user
after insert or update on auth.users
for each row
execute function public.sync_profile_from_auth_user();

drop trigger if exists audit_tasks on public.tasks;
create trigger audit_tasks
after insert or update or delete on public.tasks
for each row
execute function private.capture_task_audit();

drop trigger if exists audit_task_photos on public.task_photos;
create trigger audit_task_photos
after insert or update or delete on public.task_photos
for each row
execute function private.capture_task_audit();

drop trigger if exists audit_task_files on public.task_files;
create trigger audit_task_files
after insert or update or delete on public.task_files
for each row
execute function private.capture_task_audit();

drop trigger if exists audit_task_materials on public.task_materials;
create trigger audit_task_materials
after insert or update or delete on public.task_materials
for each row
execute function private.capture_task_audit();

drop trigger if exists audit_task_work_items on public.task_work_items;
create trigger audit_task_work_items
after insert or update or delete on public.task_work_items
for each row
execute function private.capture_task_audit();

drop trigger if exists audit_task_safety_items on public.task_safety_items;
create trigger audit_task_safety_items
after insert or update or delete on public.task_safety_items
for each row
execute function private.capture_task_audit();

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function private.can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.tasks
      where id = p_task_id
        and assigned_user_id = (select auth.uid())
    );
$$;

create or replace function private.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.tasks
      where id = p_task_id
        and assigned_user_id = (select auth.uid())
    );
$$;

alter table public.profiles enable row level security;
alter table public.material_catalog enable row level security;
alter table public.work_catalog enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;
alter table public.task_pipeline_history enable row level security;
alter table public.task_fiber_stage_history enable row level security;
alter table public.task_photos enable row level security;
alter table public.task_files enable row level security;
alter table public.task_materials enable row level security;
alter table public.task_work_items enable row level security;
alter table public.task_safety_items enable row level security;
alter table public.task_audit_log enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id or private.is_admin());

drop policy if exists "profiles_insert_self_or_admin" on public.profiles;
create policy "profiles_insert_self_or_admin"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id or private.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id or private.is_admin())
with check ((select auth.uid()) = id or private.is_admin());

drop policy if exists "profiles_delete_admin_only" on public.profiles;
create policy "profiles_delete_admin_only"
on public.profiles
for delete
to authenticated
using (private.is_admin());

drop policy if exists "material_catalog_select_authenticated" on public.material_catalog;
create policy "material_catalog_select_authenticated"
on public.material_catalog
for select
to authenticated
using (true);

drop policy if exists "material_catalog_admin_write" on public.material_catalog;
create policy "material_catalog_admin_write"
on public.material_catalog
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "work_catalog_select_authenticated" on public.work_catalog;
create policy "work_catalog_select_authenticated"
on public.work_catalog
for select
to authenticated
using (true);

drop policy if exists "work_catalog_admin_write" on public.work_catalog;
create policy "work_catalog_admin_write"
on public.work_catalog
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "tasks_select_visible" on public.tasks;
create policy "tasks_select_visible"
on public.tasks
for select
to authenticated
using (private.can_access_task(id));

drop policy if exists "tasks_insert_admin_only" on public.tasks;
create policy "tasks_insert_admin_only"
on public.tasks
for insert
to authenticated
with check (private.is_admin());

drop policy if exists "tasks_update_admin_or_assigned" on public.tasks;
create policy "tasks_update_admin_or_assigned"
on public.tasks
for update
to authenticated
using (private.can_edit_task(id))
with check (
  private.is_admin()
  or assigned_user_id = (select auth.uid())
);

drop policy if exists "tasks_delete_admin_only" on public.tasks;
create policy "tasks_delete_admin_only"
on public.tasks
for delete
to authenticated
using (private.is_admin());

drop policy if exists "task_history_select_visible" on public.task_history;
create policy "task_history_select_visible"
on public.task_history
for select
to authenticated
using (private.can_access_task(task_id));

drop policy if exists "task_history_insert_editable" on public.task_history;
create policy "task_history_insert_editable"
on public.task_history
for insert
to authenticated
with check (private.can_edit_task(task_id));

drop policy if exists "task_history_delete_admin_only" on public.task_history;
create policy "task_history_delete_admin_only"
on public.task_history
for delete
to authenticated
using (private.is_admin());

drop policy if exists "task_pipeline_history_select_visible" on public.task_pipeline_history;
create policy "task_pipeline_history_select_visible"
on public.task_pipeline_history
for select
to authenticated
using (private.can_access_task(task_id));

drop policy if exists "task_pipeline_history_insert_admin_only" on public.task_pipeline_history;
create policy "task_pipeline_history_insert_admin_only"
on public.task_pipeline_history
for insert
to authenticated
with check (private.is_admin());

drop policy if exists "task_fiber_stage_history_select_visible" on public.task_fiber_stage_history;
create policy "task_fiber_stage_history_select_visible"
on public.task_fiber_stage_history
for select
to authenticated
using (private.can_access_task(task_id));

drop policy if exists "task_fiber_stage_history_insert_editable" on public.task_fiber_stage_history;
create policy "task_fiber_stage_history_insert_editable"
on public.task_fiber_stage_history
for insert
to authenticated
with check (private.can_edit_task(task_id));

drop policy if exists "task_photos_select_visible" on public.task_photos;
create policy "task_photos_select_visible"
on public.task_photos
for select
to authenticated
using (private.can_access_task(task_id));

drop policy if exists "task_photos_insert_editable" on public.task_photos;
create policy "task_photos_insert_editable"
on public.task_photos
for insert
to authenticated
with check (private.can_edit_task(task_id));

drop policy if exists "task_photos_delete_admin_only" on public.task_photos;
create policy "task_photos_delete_admin_only"
on public.task_photos
for delete
to authenticated
using (private.is_admin());

drop policy if exists "task_files_select_visible" on public.task_files;
create policy "task_files_select_visible"
on public.task_files
for select
to authenticated
using (private.can_access_task(task_id));

drop policy if exists "task_files_insert_editable" on public.task_files;
create policy "task_files_insert_editable"
on public.task_files
for insert
to authenticated
with check (private.can_edit_task(task_id));

drop policy if exists "task_files_delete_admin_only" on public.task_files;
create policy "task_files_delete_admin_only"
on public.task_files
for delete
to authenticated
using (private.is_admin());

drop policy if exists "task_materials_select_visible" on public.task_materials;
create policy "task_materials_select_visible"
on public.task_materials
for select
to authenticated
using (private.can_access_task(task_id));

drop policy if exists "task_materials_insert_editable" on public.task_materials;
create policy "task_materials_insert_editable"
on public.task_materials
for insert
to authenticated
with check (private.can_edit_task(task_id));

drop policy if exists "task_materials_delete_admin_only" on public.task_materials;
create policy "task_materials_delete_admin_only"
on public.task_materials
for delete
to authenticated
using (private.is_admin());

drop policy if exists "task_work_items_select_visible" on public.task_work_items;
create policy "task_work_items_select_visible"
on public.task_work_items
for select
to authenticated
using (private.can_access_task(task_id));

drop policy if exists "task_work_items_insert_editable" on public.task_work_items;
create policy "task_work_items_insert_editable"
on public.task_work_items
for insert
to authenticated
with check (private.can_edit_task(task_id));

drop policy if exists "task_work_items_delete_admin_only" on public.task_work_items;
create policy "task_work_items_delete_admin_only"
on public.task_work_items
for delete
to authenticated
using (private.is_admin());

drop policy if exists "task_safety_items_select_visible" on public.task_safety_items;
create policy "task_safety_items_select_visible"
on public.task_safety_items
for select
to authenticated
using (private.can_access_task(task_id));

drop policy if exists "task_safety_items_insert_editable" on public.task_safety_items;
create policy "task_safety_items_insert_editable"
on public.task_safety_items
for insert
to authenticated
with check (private.can_edit_task(task_id));

drop policy if exists "task_safety_items_update_editable" on public.task_safety_items;
create policy "task_safety_items_update_editable"
on public.task_safety_items
for update
to authenticated
using (private.can_edit_task(task_id))
with check (private.can_edit_task(task_id));

drop policy if exists "task_safety_items_delete_admin_only" on public.task_safety_items;
create policy "task_safety_items_delete_admin_only"
on public.task_safety_items
for delete
to authenticated
using (private.is_admin());

drop policy if exists "task_audit_log_select_visible" on public.task_audit_log;
create policy "task_audit_log_select_visible"
on public.task_audit_log
for select
to authenticated
using (private.can_access_task(task_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('task-photos', 'task-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('task-files', 'task-files', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "task storage read visible tasks" on storage.objects;
create policy "task storage read visible tasks"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('task-photos', 'task-files')
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_access_task(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "task storage upload editable tasks" on storage.objects;
create policy "task storage upload editable tasks"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('task-photos', 'task-files')
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_task(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "task storage update editable tasks" on storage.objects;
create policy "task storage update editable tasks"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('task-photos', 'task-files')
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_task(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id in ('task-photos', 'task-files')
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_task(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "task storage delete editable tasks" on storage.objects;
create policy "task storage delete editable tasks"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('task-photos', 'task-files')
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_task(((storage.foldername(name))[1])::uuid)
);

commit;

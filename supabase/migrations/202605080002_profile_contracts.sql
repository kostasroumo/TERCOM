begin;

create schema if not exists private;

create table if not exists public.profile_contracts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profile_contracts_profile_id
on public.profile_contracts (profile_id, uploaded_at desc);

create unique index if not exists idx_profile_contracts_one_active_per_user
on public.profile_contracts (profile_id)
where is_active = true;

drop trigger if exists set_updated_at_profile_contracts on public.profile_contracts;
create trigger set_updated_at_profile_contracts
before update on public.profile_contracts
for each row
execute function public.set_updated_at();

create or replace function private.can_access_profile_contract(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_admin()
    or (
      private.is_active_user()
      and p_profile_id = (select auth.uid())
    );
$$;

alter table public.profile_contracts enable row level security;

drop policy if exists "profile_contracts_select_visible" on public.profile_contracts;
create policy "profile_contracts_select_visible"
on public.profile_contracts
for select
to authenticated
using (
  private.can_access_profile_contract(profile_id)
  and (
    private.is_admin()
    or is_active = true
  )
);

drop policy if exists "profile_contracts_admin_insert" on public.profile_contracts;
create policy "profile_contracts_admin_insert"
on public.profile_contracts
for insert
to authenticated
with check (private.is_admin());

drop policy if exists "profile_contracts_admin_update" on public.profile_contracts;
create policy "profile_contracts_admin_update"
on public.profile_contracts
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "profile_contracts_admin_delete" on public.profile_contracts;
create policy "profile_contracts_admin_delete"
on public.profile_contracts
for delete
to authenticated
using (private.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-contracts', 'profile-contracts', false, 52428800, array['application/pdf'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile contracts read visible" on storage.objects;
create policy "profile contracts read visible"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-contracts'
  and exists (
    select 1
    from public.profile_contracts pc
    where pc.storage_path = name
      and pc.is_active = true
      and private.can_access_profile_contract(pc.profile_id)
  )
);

drop policy if exists "profile contracts upload admin only" on storage.objects;
create policy "profile contracts upload admin only"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-contracts'
  and private.is_admin()
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
);

drop policy if exists "profile contracts update admin only" on storage.objects;
create policy "profile contracts update admin only"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-contracts'
  and private.is_admin()
)
with check (
  bucket_id = 'profile-contracts'
  and private.is_admin()
);

drop policy if exists "profile contracts delete admin only" on storage.objects;
create policy "profile contracts delete admin only"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-contracts'
  and private.is_admin()
);

commit;

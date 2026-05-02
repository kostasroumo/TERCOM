begin;

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
  resolved_is_active boolean;
begin
  select *
  into existing_profile
  from public.profiles
  where id = new.id;

  raw_role := lower(nullif(trim(new.raw_user_meta_data ->> 'role'), ''));

  resolved_role := coalesce(
    existing_profile.role,
    case raw_role
      when 'admin' then 'admin'::public.app_role
      when 'partner' then 'partner'::public.app_role
      else null
    end,
    'partner'::public.app_role
  );

  resolved_display_name := coalesce(
    nullif(trim(existing_profile.display_name), ''),
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  resolved_company_name := coalesce(
    nullif(trim(existing_profile.company_name), ''),
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
    resolved_display_name
  );

  resolved_title := coalesce(
    nullif(trim(existing_profile.title), ''),
    nullif(trim(new.raw_user_meta_data ->> 'title'), ''),
    case resolved_role
      when 'admin' then 'Administrator'
      else 'Field Partner'
    end
  );

  resolved_phone := coalesce(
    nullif(trim(existing_profile.phone), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    coalesce(new.phone, '')
  );

  resolved_is_active := coalesce(existing_profile.is_active, true);

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
    resolved_is_active
  )
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    display_name = excluded.display_name,
    company_name = excluded.company_name,
    title = excluded.title,
    phone = excluded.phone,
    is_active = excluded.is_active,
    updated_at = now();

  return new;
end;
$$;

create or replace function private.is_active_user()
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
    or (
      private.is_active_user()
      and exists (
        select 1
        from public.tasks
        where id = p_task_id
          and assigned_user_id = (select auth.uid())
      )
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
    or (
      private.is_active_user()
      and exists (
        select 1
        from public.tasks
        where id = p_task_id
          and assigned_user_id = (select auth.uid())
      )
    );
$$;

commit;

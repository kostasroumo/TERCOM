begin;

create table if not exists public.task_modules (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique,
  name text not null,
  description text not null default '',
  icon_name text not null default 'tasks',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_task_modules (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  module_key text not null references public.task_modules (module_key) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  primary key (profile_id, module_key)
);

insert into public.task_modules (
  module_key,
  name,
  description,
  icon_name,
  sort_order
)
values
  ('ftth', 'FTTH', 'Το τρέχον end-to-end flow για αυτοψία, λειτουργίες ινών, validation και παράδοση.', 'network', 10),
  ('smart_readiness', 'Smart Readiness', 'Ξεχωριστό workspace για έργα readiness, vouchers και κτιριακές παραδόσεις.', 'smart', 20),
  ('field_maintenance', 'Συντήρηση Πεδίου', 'Βλάβες, επανεπισκέψεις και διορθωτικές παρεμβάσεις με δικό τους queue.', 'wrench', 30),
  ('special_projects', 'Λοιπά Έργα', 'Χώρος για ad-hoc ή ειδικά έργα που δεν ανήκουν στο βασικό FTTH flow.', 'briefcase', 40)
on conflict (module_key) do update
set
  name = excluded.name,
  description = excluded.description,
  icon_name = excluded.icon_name,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

alter table public.tasks
  add column if not exists module_key text;

update public.tasks
set module_key = 'ftth'
where module_key is null or btrim(module_key) = '';

alter table public.tasks
  alter column module_key set default 'ftth';

alter table public.tasks
  alter column module_key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_module_key_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_module_key_fkey
      foreign key (module_key)
      references public.task_modules (module_key)
      on update cascade
      on delete restrict;
  end if;
end $$;

create index if not exists idx_tasks_module_key on public.tasks (module_key);
create index if not exists idx_profile_task_modules_profile_id on public.profile_task_modules (profile_id);
create index if not exists idx_profile_task_modules_module_key on public.profile_task_modules (module_key);

drop trigger if exists set_updated_at_task_modules on public.task_modules;
create trigger set_updated_at_task_modules
before update on public.task_modules
for each row
execute function public.set_updated_at();

insert into public.profile_task_modules (
  profile_id,
  module_key
)
select p.id, 'ftth'
from public.profiles p
where not exists (
  select 1
  from public.profile_task_modules ptm
  where ptm.profile_id = p.id
    and ptm.module_key = 'ftth'
);

create or replace function private.can_access_task_module(p_module_key text)
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
        from public.profile_task_modules ptm
        where ptm.profile_id = (select auth.uid())
          and ptm.module_key = p_module_key
      )
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
        from public.tasks t
        where t.id = p_task_id
          and t.assigned_user_id = (select auth.uid())
          and private.can_access_task_module(t.module_key)
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
        from public.tasks t
        where t.id = p_task_id
          and t.assigned_user_id = (select auth.uid())
          and private.can_access_task_module(t.module_key)
      )
    );
$$;

alter table public.task_modules enable row level security;
alter table public.profile_task_modules enable row level security;

drop policy if exists "task_modules_select_visible" on public.task_modules;
create policy "task_modules_select_visible"
on public.task_modules
for select
to authenticated
using (
  is_active = true
  and private.can_access_task_module(module_key)
);

drop policy if exists "task_modules_admin_write" on public.task_modules;
create policy "task_modules_admin_write"
on public.task_modules
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "profile_task_modules_select_self_or_admin" on public.profile_task_modules;
create policy "profile_task_modules_select_self_or_admin"
on public.profile_task_modules
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or private.is_admin()
);

drop policy if exists "profile_task_modules_admin_write" on public.profile_task_modules;
create policy "profile_task_modules_admin_write"
on public.profile_task_modules
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

create or replace function public.dashboard_bootstrap_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      p.id,
      p.email,
      p.role,
      p.display_name,
      p.company_name,
      p.title,
      p.phone,
      p.is_active
    from public.profiles p
    where p.id = auth.uid()
  ),
  visible_profiles as (
    select
      p.id,
      p.email,
      p.role,
      p.display_name,
      p.company_name,
      p.title,
      p.phone,
      p.is_active
    from public.profiles p
    cross join me
    where p.is_active = true
      and (me.role = 'admin' or p.id = me.id)
    order by p.display_name
  ),
  visible_modules as (
    select
      tm.id,
      tm.module_key,
      tm.name,
      tm.description,
      tm.icon_name,
      tm.sort_order,
      tm.is_active
    from public.task_modules tm
    cross join me
    where tm.is_active = true
      and (
        me.role = 'admin'
        or exists (
          select 1
          from public.profile_task_modules ptm
          where ptm.profile_id = me.id
            and ptm.module_key = tm.module_key
        )
      )
    order by tm.sort_order asc, tm.name asc
  ),
  visible_tasks as (
    select
      t.id,
      t.title,
      t.address,
      t.city,
      t.pipeline,
      t.status,
      t.assigned_user_id,
      t.cancellation_requested,
      t.updated_at,
      t.module_key,
      coalesce(ap.display_name, '') as assigned_user_name
    from public.tasks t
    left join public.profiles ap on ap.id = t.assigned_user_id
    cross join me
    where t.archived_at is null
      and (
        me.role = 'admin'
        or (
          t.assigned_user_id = me.id
          and exists (
            select 1
            from public.profile_task_modules ptm
            where ptm.profile_id = me.id
              and ptm.module_key = t.module_key
          )
        )
      )
  ),
  section_totals as (
    select
      case when vt.assigned_user_id is null then 'unassigned' else vt.assigned_user_id::text end as assignee_id,
      count(*)::int as total
    from visible_tasks vt
    where vt.status <> 'cancelled' or vt.assigned_user_id is not null
    group by 1
  ),
  current_pipeline_totals as (
    select
      case when vt.assigned_user_id is null then 'unassigned' else vt.assigned_user_id::text end as assignee_id,
      vt.pipeline::text as pipeline,
      count(*)::int as total
    from visible_tasks vt
    where vt.status <> 'cancelled' or vt.assigned_user_id is not null
    group by 1, 2
  ),
  current_status_rows as (
    select
      case when vt.assigned_user_id is null then 'unassigned' else vt.assigned_user_id::text end as assignee_id,
      vt.pipeline::text as pipeline,
      vt.status::text as status
    from visible_tasks vt
    where vt.status <> 'completed'
      and (vt.status <> 'cancelled' or vt.assigned_user_id is not null)
  ),
  completed_rows as (
    select
      case when vt.assigned_user_id is null then 'unassigned' else vt.assigned_user_id::text end as assignee_id,
      vt.pipeline::text as pipeline,
      'completed'::text as status
    from visible_tasks vt
    where vt.status = 'completed'
      and (vt.status <> 'cancelled' or vt.assigned_user_id is not null)

    union all

    select
      case when vt.assigned_user_id is null then 'unassigned' else vt.assigned_user_id::text end as assignee_id,
      tph.pipeline::text as pipeline,
      'completed'::text as status
    from visible_tasks vt
    join public.task_pipeline_history tph on tph.task_id = vt.id
  ),
  status_counts as (
    select
      assignee_id,
      pipeline,
      status,
      count(*)::int as total
    from (
      select * from current_status_rows
      union all
      select * from completed_rows
    ) rows_union
    group by 1, 2, 3
  ),
  cancellation_queue as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', vt.id,
          'title', vt.title,
          'address', vt.address,
          'city', vt.city,
          'pipeline', vt.pipeline,
          'status', vt.status,
          'moduleKey', vt.module_key,
          'assignedUserName', vt.assigned_user_name
        )
        order by vt.updated_at desc
      ),
      '[]'::jsonb
    ) as payload
    from visible_tasks vt
    where vt.cancellation_requested = true
  ),
  cancelled_queue as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', vt.id,
          'title', vt.title,
          'address', vt.address,
          'city', vt.city,
          'pipeline', vt.pipeline,
          'status', vt.status,
          'moduleKey', vt.module_key,
          'assignedUserName', vt.assigned_user_name
        )
        order by vt.updated_at desc
      ),
      '[]'::jsonb
    ) as payload
    from visible_tasks vt
    where vt.status = 'cancelled'
  ),
  archived_queue as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'address', t.address,
          'city', t.city,
          'pipeline', t.pipeline,
          'status', t.status,
          'moduleKey', t.module_key,
          'assignedUserName', coalesce(ap.display_name, ''),
          'archivedAt', t.archived_at,
          'archivedBy', coalesce(arp.display_name, '')
        )
        order by t.archived_at desc nulls last, t.updated_at desc
      ),
      '[]'::jsonb
    ) as payload
    from public.tasks t
    left join public.profiles ap on ap.id = t.assigned_user_id
    left join public.profiles arp on arp.id = t.archived_by
    cross join me
    where me.role = 'admin'
      and t.archived_at is not null
  )
  select jsonb_build_object(
    'profile',
    coalesce((select to_jsonb(me) from me), 'null'::jsonb),
    'profiles',
    coalesce((select jsonb_agg(to_jsonb(vp) order by vp.display_name) from visible_profiles vp), '[]'::jsonb),
    'taskModules',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', vm.id,
            'key', vm.module_key,
            'name', vm.name,
            'description', vm.description,
            'icon', vm.icon_name,
            'sortOrder', vm.sort_order,
            'isActive', vm.is_active
          )
          order by vm.sort_order, vm.name
        )
        from visible_modules vm
      ),
      '[]'::jsonb
    ),
    'sectionTotals',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assigneeId', st.assignee_id,
            'total', st.total
          )
          order by st.assignee_id
        )
        from section_totals st
      ),
      '[]'::jsonb
    ),
    'currentPipelineTotals',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assigneeId', cpt.assignee_id,
            'pipeline', cpt.pipeline,
            'total', cpt.total
          )
          order by cpt.assignee_id, cpt.pipeline
        )
        from current_pipeline_totals cpt
      ),
      '[]'::jsonb
    ),
    'statusCounts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assigneeId', sc.assignee_id,
            'pipeline', sc.pipeline,
            'status', sc.status,
            'count', sc.total
          )
          order by sc.assignee_id, sc.pipeline, sc.status
        )
        from status_counts sc
      ),
      '[]'::jsonb
    ),
    'queues',
    jsonb_build_object(
      'cancellationRequested', (select payload from cancellation_queue),
      'cancelled', (select payload from cancelled_queue),
      'archived', (select payload from archived_queue)
    )
  );
$$;

grant execute on function public.dashboard_bootstrap_v1() to authenticated;

commit;

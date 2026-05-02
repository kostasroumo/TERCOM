begin;

alter table public.tasks
  add column if not exists archived_at timestamptz;

alter table public.tasks
  add column if not exists archived_by uuid references public.profiles (id) on delete set null;

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
      coalesce(ap.display_name, '') as assigned_user_name
    from public.tasks t
    left join public.profiles ap on ap.id = t.assigned_user_id
    cross join me
    where t.archived_at is null
      and (
        me.role = 'admin'
        or t.assigned_user_id = me.id
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

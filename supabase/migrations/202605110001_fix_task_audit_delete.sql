begin;

alter table public.task_audit_log
  add column if not exists task_assigned_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists task_module_key text;

update public.task_audit_log
set
  task_assigned_user_id = coalesce(
    task_assigned_user_id,
    private.try_uuid(coalesce(after_state ->> 'assigned_user_id', before_state ->> 'assigned_user_id'))
  ),
  task_module_key = coalesce(
    task_module_key,
    nullif(coalesce(after_state ->> 'module_key', before_state ->> 'module_key'), '')
  )
where task_assigned_user_id is null
   or task_module_key is null;

update public.task_audit_log tal
set
  task_assigned_user_id = coalesce(tal.task_assigned_user_id, t.assigned_user_id),
  task_module_key = coalesce(tal.task_module_key, t.module_key)
from public.tasks t
where t.id = tal.task_id
  and (
    tal.task_assigned_user_id is null
    or tal.task_module_key is null
  );

alter table public.task_audit_log
  drop constraint if exists task_audit_log_task_id_fkey;

create index if not exists idx_task_audit_log_assigned_user
  on public.task_audit_log (task_assigned_user_id, created_at desc);

create index if not exists idx_task_audit_log_module
  on public.task_audit_log (task_module_key, created_at desc);

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
  resolved_task_assigned_user_id uuid;
  resolved_task_module_key text;
  changed jsonb := '{}'::jsonb;
  candidate_actor_id uuid;
begin
  if tg_table_name = 'tasks' then
    resolved_task_id := coalesce(new.id, old.id);
  else
    resolved_task_id := coalesce(new.task_id, old.task_id);
  end if;

  resolved_record_id := coalesce(new.id, old.id);

  if tg_table_name = 'tasks' then
    resolved_task_assigned_user_id := private.try_uuid(
      coalesce(row_after ->> 'assigned_user_id', row_before ->> 'assigned_user_id')
    );
    resolved_task_module_key := nullif(
      coalesce(row_after ->> 'module_key', row_before ->> 'module_key'),
      ''
    );
  else
    select
      t.assigned_user_id,
      t.module_key
    into
      resolved_task_assigned_user_id,
      resolved_task_module_key
    from public.tasks t
    where t.id = resolved_task_id;

    if resolved_task_assigned_user_id is null and resolved_task_module_key is null then
      select
        tal.task_assigned_user_id,
        tal.task_module_key
      into
        resolved_task_assigned_user_id,
        resolved_task_module_key
      from public.task_audit_log tal
      where tal.task_id = resolved_task_id
        and (
          tal.task_assigned_user_id is not null
          or tal.task_module_key is not null
        )
      order by tal.created_at desc
      limit 1;
    end if;
  end if;

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
    task_assigned_user_id,
    task_module_key,
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
    resolved_task_assigned_user_id,
    resolved_task_module_key,
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

drop policy if exists "task_audit_log_select_visible" on public.task_audit_log;
create policy "task_audit_log_select_visible"
on public.task_audit_log
for select
to authenticated
using (
  private.is_admin()
  or (
    private.is_active_user()
    and (
      private.can_access_task(task_id)
      or (
        task_assigned_user_id = (select auth.uid())
        and (
          task_module_key is null
          or private.can_access_task_module(task_module_key)
        )
      )
    )
  )
);

commit;

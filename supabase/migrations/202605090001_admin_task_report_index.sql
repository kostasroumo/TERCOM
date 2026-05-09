begin;

create index if not exists idx_tasks_assignee_completed_report
on public.tasks (assigned_user_id, status, module_key, completed_at desc)
include (end_date);

commit;

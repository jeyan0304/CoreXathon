-- Idempotent repair for the five-table workflow backend contract.
-- Run in the Supabase SQL Editor, then keep this file as migration evidence.

alter table public.workflow_steps
    add column if not exists tool_id uuid references public.tools(id),
    add column if not exists output jsonb,
    add column if not exists retry_count integer not null default 0;

-- A legacy schema stored the tool name directly. The normalized contract uses
-- tool_id, so preserve legacy data while allowing new normalized inserts.
alter table public.workflow_steps
    alter column tool_name drop not null;

alter table public.audit_logs
    add column if not exists step_id uuid,
    add column if not exists actor text,
    add column if not exists action text;

-- A legacy schema used event_type instead of action. Keep any existing data,
-- but stop that obsolete column from rejecting contract-compliant inserts.
alter table public.audit_logs
    alter column event_type drop not null;

create index if not exists workflow_steps_tool_id_idx
    on public.workflow_steps (tool_id);

create index if not exists audit_logs_workflow_created_at_idx
    on public.audit_logs (workflow_id, created_at);

create index if not exists audit_logs_step_id_idx
    on public.audit_logs (step_id);

notify pgrst, 'reload schema';

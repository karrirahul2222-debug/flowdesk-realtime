-- FlowDesk additive Jira-style extensions and compatibility RPCs.
-- Non-destructive: existing operational tables and rows are preserved.

begin;

-- ---------------------------------------------------------------------------
-- Jira-style planning tables
-- ---------------------------------------------------------------------------

create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  goal text,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  start_date date,
  end_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint sprints_project_same_org_fk foreign key (project_id, organization_id)
    references public.projects(id, organization_id),
  constraint sprints_dates_check check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.epics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  color text default '#7855cc',
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint epics_project_same_org_fk foreign key (project_id, organization_id)
    references public.projects(id, organization_id)
);

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  color text default '#687286',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

alter table public.tasks add column if not exists issue_type text not null default 'task';
alter table public.tasks add column if not exists story_points smallint;
alter table public.tasks add column if not exists sprint_id uuid;
alter table public.tasks add column if not exists epic_id uuid;
alter table public.tasks add column if not exists rank numeric not null default 0;
alter table public.tasks add column if not exists acceptance_criteria text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_issue_type_check') then
    alter table public.tasks add constraint tasks_issue_type_check
      check (issue_type in ('epic', 'story', 'task', 'bug', 'subtask'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_story_points_check') then
    alter table public.tasks add constraint tasks_story_points_check
      check (story_points is null or story_points between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_sprint_id_fkey') then
    alter table public.tasks add constraint tasks_sprint_id_fkey
      foreign key (sprint_id) references public.sprints(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_epic_id_fkey') then
    alter table public.tasks add constraint tasks_epic_id_fkey
      foreign key (epic_id) references public.epics(id) on delete set null;
  end if;
end $$;


create or replace function private.validate_task_planning_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sprint_id is not null and not exists (
    select 1 from public.sprints s
    where s.id = new.sprint_id
      and s.organization_id = new.organization_id
      and s.project_id = new.project_id
  ) then
    raise exception 'sprint_must_belong_to_task_project' using errcode = '23514';
  end if;

  if new.epic_id is not null and not exists (
    select 1 from public.epics e
    where e.id = new.epic_id
      and e.organization_id = new.organization_id
      and e.project_id = new.project_id
  ) then
    raise exception 'epic_must_belong_to_task_project' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_task_planning_scope on public.tasks;
create trigger validate_task_planning_scope
before insert or update of organization_id, project_id, sprint_id, epic_id on public.tasks
for each row execute function private.validate_task_planning_scope();

create table if not exists public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  added_at timestamptz not null default now(),
  primary key (task_id, label_id),
  constraint task_labels_task_same_org_fk foreign key (task_id, organization_id)
    references public.tasks(id, organization_id),
  constraint task_labels_label_same_org_fk foreign key (label_id, organization_id)
    references public.labels(id, organization_id)
);

create index if not exists sprints_org_project_status_idx on public.sprints(organization_id, project_id, status);
create index if not exists epics_org_project_status_idx on public.epics(organization_id, project_id, status);
create index if not exists tasks_sprint_status_idx on public.tasks(sprint_id, status) where sprint_id is not null;
create index if not exists tasks_epic_idx on public.tasks(epic_id) where epic_id is not null;
create index if not exists tasks_rank_idx on public.tasks(project_id, rank);
create index if not exists task_labels_org_idx on public.task_labels(organization_id);

-- Reuse the existing updated_at trigger helper.
drop trigger if exists set_sprints_updated_at on public.sprints;
create trigger set_sprints_updated_at before update on public.sprints
for each row execute function private.set_updated_at();

drop trigger if exists set_epics_updated_at on public.epics;
create trigger set_epics_updated_at before update on public.epics
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS for new tables
-- ---------------------------------------------------------------------------

alter table public.sprints enable row level security;
alter table public.epics enable row level security;
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;

drop policy if exists "sprints_select_org_members" on public.sprints;
create policy "sprints_select_org_members" on public.sprints for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists "sprints_insert_managers" on public.sprints;
create policy "sprints_insert_managers" on public.sprints for insert to authenticated
with check (
  created_by = auth.uid()
  and private.has_org_role(organization_id, array['ceo','admin','manager','team_lead'])
);

drop policy if exists "sprints_update_managers" on public.sprints;
create policy "sprints_update_managers" on public.sprints for update to authenticated
using (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']))
with check (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']));

drop policy if exists "sprints_delete_managers" on public.sprints;
create policy "sprints_delete_managers" on public.sprints for delete to authenticated
using (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']));

drop policy if exists "epics_select_org_members" on public.epics;
create policy "epics_select_org_members" on public.epics for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists "epics_insert_managers" on public.epics;
create policy "epics_insert_managers" on public.epics for insert to authenticated
with check (
  created_by = auth.uid()
  and private.has_org_role(organization_id, array['ceo','admin','manager','team_lead'])
);

drop policy if exists "epics_update_managers" on public.epics;
create policy "epics_update_managers" on public.epics for update to authenticated
using (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']))
with check (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']));

drop policy if exists "epics_delete_managers" on public.epics;
create policy "epics_delete_managers" on public.epics for delete to authenticated
using (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']));

drop policy if exists "labels_select_org_members" on public.labels;
create policy "labels_select_org_members" on public.labels for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists "labels_write_managers" on public.labels;
drop policy if exists "labels_insert_managers" on public.labels;
create policy "labels_insert_managers" on public.labels for insert to authenticated
with check (
  created_by = auth.uid()
  and private.has_org_role(organization_id, array['ceo','admin','manager','team_lead'])
);

drop policy if exists "labels_update_managers" on public.labels;
create policy "labels_update_managers" on public.labels for update to authenticated
using (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']))
with check (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']));

drop policy if exists "labels_delete_managers" on public.labels;
create policy "labels_delete_managers" on public.labels for delete to authenticated
using (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']));

drop policy if exists "task_labels_select_task_viewers" on public.task_labels;
create policy "task_labels_select_task_viewers" on public.task_labels for select to authenticated
using (private.can_view_task(task_id));

drop policy if exists "task_labels_write_managers" on public.task_labels;
create policy "task_labels_write_managers" on public.task_labels for all to authenticated
using (private.has_org_role(organization_id, array['ceo','admin','manager','team_lead']))
with check (
  added_by = auth.uid()
  and private.has_org_role(organization_id, array['ceo','admin','manager','team_lead'])
);

grant select, insert, update, delete on public.sprints, public.epics, public.labels, public.task_labels to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic onboarding: prevents orphan organizations and duplicate retries.
-- ---------------------------------------------------------------------------

create or replace function public.create_workspace(
  p_name text,
  p_timezone text default 'Asia/Kolkata'
) returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_full_name text;
  v_email text;
  v_avatar_url text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then
    raise exception 'workspace_name_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Idempotent retry: return the existing active workspace instead of creating duplicates.
  select om.organization_id
    into v_organization_id
  from public.organization_members om
  where om.user_id = v_user_id and om.active
  order by om.is_owner desc, om.joined_at asc
  limit 1;

  if v_organization_id is not null then
    return v_organization_id;
  end if;

  select
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1), 'Workspace owner'),
    u.email,
    coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
  into v_full_name, v_email, v_avatar_url
  from auth.users u
  where u.id = v_user_id;

  insert into public.organizations(name, timezone, created_by)
  values (trim(p_name), coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata'), v_user_id)
  returning id into v_organization_id;

  insert into public.organization_members(organization_id, user_id, role, is_owner, active)
  values (v_organization_id, v_user_id, 'ceo', true, true);

  insert into public.people(
    organization_id, auth_user_id, full_name, email, access_role, status, avatar_url, created_by
  ) values (
    v_organization_id, v_user_id, v_full_name, v_email, 'ceo', 'active', v_avatar_url, v_user_id
  );

  return v_organization_id;
end;
$$;

revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;

-- Returns zero, one, or many rows. Frontends must not call .single().
create or replace function public.get_access_context()
returns table (
  organization_id uuid,
  organization_name text,
  role text,
  is_owner boolean,
  active boolean
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select o.id, o.name, om.role, om.is_owner, om.active
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.user_id = auth.uid() and om.active
  order by om.is_owner desc, om.joined_at asc;
$$;

revoke all on function public.get_access_context() from public;
grant execute on function public.get_access_context() to authenticated;

-- ---------------------------------------------------------------------------
-- Compatibility RPCs used by the previous AI Studio frontend.
-- ---------------------------------------------------------------------------

create or replace function public.add_employee_profile(
  p_department_id uuid,
  p_email text,
  p_job_title text,
  p_manager_email text,
  p_name text,
  p_role text,
  p_team_id uuid,
  p_weekly_capacity_hours numeric
) returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_manager_id uuid;
  v_linked_auth_user_id uuid;
  v_person_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select om.organization_id into v_organization_id
  from public.organization_members om
  where om.user_id = v_user_id
    and om.active
    and om.role in ('ceo', 'admin')
  order by om.is_owner desc, om.joined_at asc
  limit 1;

  if v_organization_id is null then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  if p_role not in ('ceo','admin','manager','team_lead','employee','viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then
    raise exception 'employee_name_invalid' using errcode = '22023';
  end if;

  if coalesce(p_weekly_capacity_hours, 40) < 0 or coalesce(p_weekly_capacity_hours, 40) > 168 then
    raise exception 'capacity_invalid' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_email, '')), '') is not null and exists (
    select 1 from public.people p
    where p.organization_id = v_organization_id and lower(p.email) = lower(trim(p_email))
  ) then
    raise exception 'employee_email_already_exists' using errcode = '23505';
  end if;

  if nullif(trim(coalesce(p_manager_email, '')), '') is not null then
    select p.id into v_manager_id
    from public.people p
    where p.organization_id = v_organization_id
      and lower(p.email) = lower(trim(p_manager_email))
    limit 1;
  end if;

  if nullif(trim(coalesce(p_email, '')), '') is not null then
    select u.id into v_linked_auth_user_id
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
    order by u.created_at asc
    limit 1;
  end if;

  insert into public.people(
    organization_id, auth_user_id, full_name, email, job_title, access_role,
    department_id, team_id, manager_id, weekly_capacity_hours, status, created_by
  ) values (
    v_organization_id,
    v_linked_auth_user_id,
    trim(p_name),
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    nullif(trim(coalesce(p_job_title, '')), ''),
    p_role,
    p_department_id,
    p_team_id,
    v_manager_id,
    coalesce(p_weekly_capacity_hours, 40),
    case when v_linked_auth_user_id is null then 'invited' else 'active' end,
    v_user_id
  ) returning id into v_person_id;

  if v_linked_auth_user_id is not null then
    insert into public.organization_members(organization_id, user_id, role, is_owner, active)
    values (v_organization_id, v_linked_auth_user_id, p_role, false, true)
    on conflict (organization_id, user_id)
    do update set role = excluded.role, active = true;
  end if;

  return v_person_id;
end;
$$;

revoke all on function public.add_employee_profile(uuid, text, text, text, text, text, uuid, numeric) from public;
grant execute on function public.add_employee_profile(uuid, text, text, text, text, text, uuid, numeric) to authenticated;

create or replace function public.update_task_progress(
  p_hours_spent numeric,
  p_message text,
  p_progress smallint,
  p_task_id uuid
) returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_current_status text;
  v_next_status text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select t.organization_id, t.status into v_organization_id, v_current_status
  from public.tasks t where t.id = p_task_id;

  if v_organization_id is null then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;

  if not (
    private.is_task_assignee(p_task_id)
    or private.has_org_role(v_organization_id, array['ceo','admin','manager','team_lead'])
  ) then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  if p_progress < 0 or p_progress > 100 then
    raise exception 'progress_invalid' using errcode = '22023';
  end if;

  v_next_status := case
    when p_progress = 100 then 'review'
    when p_progress > 0 and v_current_status in ('backlog','todo') then 'in_progress'
    else v_current_status
  end;

  update public.tasks
  set progress = p_progress, status = v_next_status
  where id = p_task_id;

  insert into public.task_updates(organization_id, task_id, user_id, progress, proposed_status, message)
  values (v_organization_id, p_task_id, v_user_id, p_progress, v_next_status, nullif(trim(coalesce(p_message, '')), ''));

  if coalesce(p_hours_spent, 0) > 0 then
    insert into public.task_time_entries(organization_id, task_id, user_id, minutes, note)
    values (
      v_organization_id,
      p_task_id,
      v_user_id,
      greatest(1, round(p_hours_spent * 60)::integer),
      nullif(trim(coalesce(p_message, '')), '')
    );
  end if;
end;
$$;

revoke all on function public.update_task_progress(numeric, text, smallint, uuid) from public;
grant execute on function public.update_task_progress(numeric, text, smallint, uuid) to authenticated;

create or replace function public.report_task_blocker(
  p_reason text,
  p_task_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_blocker_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select t.organization_id into v_organization_id from public.tasks t where t.id = p_task_id;
  if v_organization_id is null then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;

  if not (
    private.is_task_assignee(p_task_id)
    or private.has_org_role(v_organization_id, array['ceo','admin','manager','team_lead'])
  ) then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 2000 then
    raise exception 'blocker_reason_invalid' using errcode = '22023';
  end if;

  insert into public.task_blockers(organization_id, task_id, reported_by, reason)
  values (v_organization_id, p_task_id, v_user_id, trim(p_reason))
  returning id into v_blocker_id;

  update public.tasks set status = 'blocked' where id = p_task_id;

  return v_blocker_id;
end;
$$;

revoke all on function public.report_task_blocker(text, uuid) from public;
grant execute on function public.report_task_blocker(text, uuid) to authenticated;

create or replace function public.submit_task_for_review(
  p_message text,
  p_reviewer_email text,
  p_task_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_progress smallint;
  v_reviewer_user_id uuid;
  v_approval_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select t.organization_id, t.progress into v_organization_id, v_progress
  from public.tasks t where t.id = p_task_id;

  if v_organization_id is null then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;

  if not (
    private.is_task_assignee(p_task_id)
    or private.has_org_role(v_organization_id, array['ceo','admin','manager','team_lead'])
  ) then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_reviewer_email, '')), '') is not null then
    select p.auth_user_id into v_reviewer_user_id
    from public.people p
    where p.organization_id = v_organization_id
      and lower(p.email) = lower(trim(p_reviewer_email))
      and p.auth_user_id is not null
    limit 1;
  else
    select p.auth_user_id into v_reviewer_user_id
    from public.tasks t
    join public.people p on p.id = t.reviewer_person_id
    where t.id = p_task_id;
  end if;

  insert into public.task_approvals(
    organization_id, task_id, requested_by, reviewer_user_id, request_message
  ) values (
    v_organization_id, p_task_id, v_user_id, v_reviewer_user_id,
    nullif(trim(coalesce(p_message, '')), '')
  ) returning id into v_approval_id;

  update public.tasks set status = 'review' where id = p_task_id;

  insert into public.task_updates(organization_id, task_id, user_id, progress, proposed_status, message)
  values (v_organization_id, p_task_id, v_user_id, v_progress, 'review', nullif(trim(coalesce(p_message, '')), ''));

  return v_approval_id;
end;
$$;

revoke all on function public.submit_task_for_review(text, text, uuid) from public;
grant execute on function public.submit_task_for_review(text, text, uuid) to authenticated;

-- Add operational tables to Supabase Realtime. The publication was empty during audit.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'projects', 'people', 'departments', 'teams', 'tasks', 'task_assignees',
    'task_comments', 'task_updates', 'task_time_entries', 'task_evidence',
    'task_blockers', 'task_approvals', 'notifications', 'sprints', 'epics',
    'labels', 'task_labels'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

commit;

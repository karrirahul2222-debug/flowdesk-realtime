


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."accept_workspace_invitation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  invitation public.workspace_invitations%rowtype;
  current_email text;
  current_name text;
begin
  if (select auth.uid()) is null or new.user_id <> (select auth.uid()) then
    raise exception 'Authentication required';
  end if;

  select wi.*
  into invitation
  from public.workspace_invitations wi
  where wi.id = new.invitation_id
    and wi.accepted_at is null
    and wi.expires_at > now()
    and wi.token_hash = encode(extensions.digest(new.token, 'sha256'), 'hex')
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;

  select u.email, coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1))
  into current_email, current_name
  from auth.users u
  where u.id = new.user_id;

  if invitation.email is not null and lower(invitation.email) <> lower(current_email) then
    raise exception 'This invitation was issued to a different email address';
  end if;

  if exists (
    select 1
    from public.organization_members om
    where om.organization_id = invitation.organization_id
      and om.user_id = new.user_id
  ) then
    raise exception 'You already belong to this workspace';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    is_owner,
    role,
    active
  )
  values (
    invitation.organization_id,
    new.user_id,
    false,
    invitation.role,
    true
  );

  update public.people
  set auth_user_id = new.user_id,
      email = current_email,
      access_role = invitation.role,
      status = 'active'
  where organization_id = invitation.organization_id
    and auth_user_id is null
    and email is not null
    and lower(email) = lower(current_email);

  if not found and not exists (
      select 1
      from public.people p
      where p.organization_id = invitation.organization_id
        and p.auth_user_id = new.user_id
    ) then
    insert into public.people (
      organization_id,
      auth_user_id,
      full_name,
      email,
      access_role,
      status,
      created_by
    )
    values (
      invitation.organization_id,
      new.user_id,
      coalesce(current_name, 'Workspace member'),
      current_email,
      invitation.role,
      'active',
      invitation.created_by
    );
  end if;

  update public.workspace_invitations
  set accepted_at = now(),
      accepted_by = new.user_id
  where id = invitation.id;

  return null;
end;
$$;


ALTER FUNCTION "private"."accept_workspace_invitation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_view_task"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        private.has_org_role(
          t.organization_id,
          array['ceo','admin','manager','team_lead','viewer']
        )
        or t.created_by = (select auth.uid())
        or private.is_task_assignee(t.id)
      )
  );
$$;


ALTER FUNCTION "private"."can_view_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_org_role"("p_organization_id" "uuid", "p_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = (select auth.uid())
        and om.active = true
        and om.role = any(p_roles)
    );
$$;


ALTER FUNCTION "private"."has_org_role"("p_organization_id" "uuid", "p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_org_member"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = (select auth.uid())
        and om.active = true
    );
$$;


ALTER FUNCTION "private"."is_org_member"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_task_assignee"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.task_assignees ta
      join public.people p on p.id = ta.person_id
      where ta.task_id = p_task_id
        and p.auth_user_id = (select auth.uid())
        and p.status = 'active'
    );
$$;


ALTER FUNCTION "private"."is_task_assignee"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "private"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."task_belongs_to_org"("p_task_id" "uuid", "p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and t.organization_id = p_organization_id
  );
$$;


ALTER FUNCTION "private"."task_belongs_to_org"("p_task_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."try_uuid"("p_value" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;


ALTER FUNCTION "private"."try_uuid"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_task_planning_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "private"."validate_task_planning_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_employee_profile"("p_department_id" "uuid", "p_email" "text", "p_job_title" "text", "p_manager_email" "text", "p_name" "text", "p_role" "text", "p_team_id" "uuid", "p_weekly_capacity_hours" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."add_employee_profile"("p_department_id" "uuid", "p_email" "text", "p_job_title" "text", "p_manager_email" "text", "p_name" "text", "p_role" "text", "p_team_id" "uuid", "p_weekly_capacity_hours" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_workspace"("p_name" "text", "p_timezone" "text" DEFAULT 'Asia/Kolkata'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."create_workspace"("p_name" "text", "p_timezone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_access_context"() RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "role" "text", "is_owner" boolean, "active" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
  select o.id, o.name, om.role, om.is_owner, om.active
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.user_id = auth.uid() and om.active
  order by om.is_owner desc, om.joined_at asc;
$$;


ALTER FUNCTION "public"."get_access_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_task_blocker"("p_reason" "text", "p_task_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."report_task_blocker"("p_reason" "text", "p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_task_for_review"("p_message" "text", "p_reviewer_email" "text", "p_task_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."submit_task_for_review"("p_message" "text", "p_reviewer_email" "text", "p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_task_progress"("p_hours_spent" numeric, "p_message" "text", "p_progress" smallint, "p_task_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."update_task_progress"("p_hours_spent" numeric, "p_message" "text", "p_progress" smallint, "p_task_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "departments_name_length" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 80)))
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."epics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#7855cc'::"text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "epics_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 160))),
    CONSTRAINT "epics_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."epics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitation_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invitation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invitation_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#687286'::"text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "labels_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 1) AND ("char_length"(TRIM(BOTH FROM "name")) <= 50)))
);


ALTER TABLE "public"."labels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['info'::"text", 'task'::"text", 'approval'::"text", 'warning'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_owner" boolean DEFAULT false NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'employee'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    CONSTRAINT "organizations_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 100)))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "auth_user_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "job_title" "text",
    "access_role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "department_id" "uuid",
    "team_id" "uuid",
    "manager_id" "uuid",
    "weekly_capacity_hours" numeric(5,2) DEFAULT 40 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "avatar_url" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "people_capacity_check" CHECK ((("weekly_capacity_hours" >= (0)::numeric) AND ("weekly_capacity_hours" <= (168)::numeric))),
    CONSTRAINT "people_name_length" CHECK ((("char_length"(TRIM(BOTH FROM "full_name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "full_name")) <= 100))),
    CONSTRAINT "people_role_check" CHECK (("access_role" = ANY (ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'employee'::"text", 'viewer'::"text"]))),
    CONSTRAINT "people_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'invited'::"text"])))
);


ALTER TABLE "public"."people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "project_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "description" "text",
    "status" "text" DEFAULT 'planning'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "owner_person_id" "uuid",
    "start_date" "date",
    "due_date" "date",
    "progress" smallint DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "projects_dates_check" CHECK ((("due_date" IS NULL) OR ("start_date" IS NULL) OR ("due_date" >= "start_date"))),
    CONSTRAINT "projects_name_length" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "projects_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "projects_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100))),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['planning'::"text", 'active'::"text", 'on_hold'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "goal" "text",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sprints_dates_check" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "sprints_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "sprints_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."sprints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "reviewer_user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "request_message" "text",
    "decision_note" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    CONSTRAINT "task_approvals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."task_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_assignees" (
    "task_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_assignees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_blockers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "reported_by" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolution" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "task_blockers_reason_length" CHECK ((("char_length"(TRIM(BOTH FROM "reason")) >= 2) AND ("char_length"(TRIM(BOTH FROM "reason")) <= 2000))),
    CONSTRAINT "task_blockers_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."task_blockers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "author_user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_comments_body_length" CHECK ((("char_length"(TRIM(BOTH FROM "body")) >= 1) AND ("char_length"(TRIM(BOTH FROM "body")) <= 5000)))
);


ALTER TABLE "public"."task_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "file_size" bigint,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_evidence_size_check" CHECK ((("file_size" IS NULL) OR (("file_size" >= 0) AND ("file_size" <= 10485760))))
);


ALTER TABLE "public"."task_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_labels" (
    "task_id" "uuid" NOT NULL,
    "label_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "added_by" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_labels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_time_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "minutes" integer NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_time_minutes_check" CHECK ((("minutes" >= 1) AND ("minutes" <= 1440)))
);


ALTER TABLE "public"."task_time_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "progress" smallint NOT NULL,
    "proposed_status" "text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_updates_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100))),
    CONSTRAINT "task_updates_status_check" CHECK (("proposed_status" = ANY (ARRAY['todo'::"text", 'in_progress'::"text", 'blocked'::"text", 'review'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."task_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "parent_task_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "start_date" "date",
    "due_date" "date",
    "estimated_hours" numeric(7,2),
    "progress" smallint DEFAULT 0 NOT NULL,
    "reviewer_person_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "issue_type" "text" DEFAULT 'task'::"text" NOT NULL,
    "story_points" smallint,
    "sprint_id" "uuid",
    "epic_id" "uuid",
    "rank" numeric DEFAULT 0 NOT NULL,
    "acceptance_criteria" "text",
    CONSTRAINT "tasks_dates_check" CHECK ((("due_date" IS NULL) OR ("start_date" IS NULL) OR ("due_date" >= "start_date"))),
    CONSTRAINT "tasks_estimate_check" CHECK ((("estimated_hours" IS NULL) OR ("estimated_hours" >= (0)::numeric))),
    CONSTRAINT "tasks_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['epic'::"text", 'story'::"text", 'task'::"text", 'bug'::"text", 'subtask'::"text"]))),
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "tasks_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['backlog'::"text", 'todo'::"text", 'in_progress'::"text", 'blocked'::"text", 'review'::"text", 'done'::"text"]))),
    CONSTRAINT "tasks_story_points_check" CHECK ((("story_points" IS NULL) OR (("story_points" >= 0) AND ("story_points" <= 100)))),
    CONSTRAINT "tasks_title_length" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 2) AND ("char_length"(TRIM(BOTH FROM "title")) <= 180)))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "department_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teams_name_length" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 80)))
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_invitations_email_check" CHECK ((("email" IS NULL) OR (POSITION(('@'::"text") IN ("email")) > 1))),
    CONSTRAINT "workspace_invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'team_lead'::"text", 'employee'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."workspace_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "author_user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_messages_body_length_check" CHECK ((("char_length"(TRIM(BOTH FROM "body")) >= 1) AND ("char_length"(TRIM(BOTH FROM "body")) <= 4000)))
);


ALTER TABLE "public"."workspace_messages" OWNER TO "postgres";


ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."epics"
    ADD CONSTRAINT "epics_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."epics"
    ADD CONSTRAINT "epics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitation_claims"
    ADD CONSTRAINT "invitation_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "labels_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "labels_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "labels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id", "person_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_approvals"
    ADD CONSTRAINT "task_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id", "person_id");



ALTER TABLE ONLY "public"."task_blockers"
    ADD CONSTRAINT "task_blockers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_evidence"
    ADD CONSTRAINT "task_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_evidence"
    ADD CONSTRAINT "task_evidence_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."task_labels"
    ADD CONSTRAINT "task_labels_pkey" PRIMARY KEY ("task_id", "label_id");



ALTER TABLE ONLY "public"."task_time_entries"
    ADD CONSTRAINT "task_time_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_updates"
    ADD CONSTRAINT "task_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."workspace_messages"
    ADD CONSTRAINT "workspace_messages_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "departments_id_org_unique" ON "public"."departments" USING "btree" ("id", "organization_id");



CREATE UNIQUE INDEX "departments_org_name_unique" ON "public"."departments" USING "btree" ("organization_id", "lower"("name"));



CREATE INDEX "epics_org_project_status_idx" ON "public"."epics" USING "btree" ("organization_id", "project_id", "status");



CREATE INDEX "idx_departments_created_by" ON "public"."departments" USING "btree" ("created_by");



CREATE INDEX "idx_departments_org" ON "public"."departments" USING "btree" ("organization_id");



CREATE INDEX "idx_invitation_claims_invitation" ON "public"."invitation_claims" USING "btree" ("invitation_id");



CREATE INDEX "idx_invitation_claims_user" ON "public"."invitation_claims" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_org" ON "public"."notifications" USING "btree" ("organization_id");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "idx_organization_members_access" ON "public"."organization_members" USING "btree" ("organization_id", "user_id", "active", "role");



CREATE INDEX "idx_organization_members_user_org" ON "public"."organization_members" USING "btree" ("user_id", "organization_id");



CREATE INDEX "idx_organizations_created_by" ON "public"."organizations" USING "btree" ("created_by");



CREATE INDEX "idx_people_auth_user" ON "public"."people" USING "btree" ("auth_user_id");



CREATE INDEX "idx_people_created_by" ON "public"."people" USING "btree" ("created_by");



CREATE INDEX "idx_people_department_org" ON "public"."people" USING "btree" ("department_id", "organization_id");



CREATE INDEX "idx_people_manager" ON "public"."people" USING "btree" ("manager_id");



CREATE INDEX "idx_people_manager_org" ON "public"."people" USING "btree" ("manager_id", "organization_id");



CREATE INDEX "idx_people_org_structure" ON "public"."people" USING "btree" ("organization_id", "department_id", "team_id", "status");



CREATE INDEX "idx_people_team_org" ON "public"."people" USING "btree" ("team_id", "organization_id");



CREATE INDEX "idx_project_members_org_person" ON "public"."project_members" USING "btree" ("organization_id", "person_id");



CREATE INDEX "idx_project_members_person_org" ON "public"."project_members" USING "btree" ("person_id", "organization_id");



CREATE INDEX "idx_project_members_project_org" ON "public"."project_members" USING "btree" ("project_id", "organization_id");



CREATE INDEX "idx_projects_created_by" ON "public"."projects" USING "btree" ("created_by");



CREATE INDEX "idx_projects_org_status" ON "public"."projects" USING "btree" ("organization_id", "status", "due_date");



CREATE INDEX "idx_projects_owner_org" ON "public"."projects" USING "btree" ("owner_person_id", "organization_id");



CREATE INDEX "idx_task_approvals_org_status" ON "public"."task_approvals" USING "btree" ("organization_id", "status", "requested_at" DESC);



CREATE INDEX "idx_task_approvals_requested_by" ON "public"."task_approvals" USING "btree" ("requested_by");



CREATE INDEX "idx_task_approvals_reviewer" ON "public"."task_approvals" USING "btree" ("reviewer_user_id");



CREATE INDEX "idx_task_approvals_task" ON "public"."task_approvals" USING "btree" ("task_id");



CREATE INDEX "idx_task_approvals_task_org" ON "public"."task_approvals" USING "btree" ("task_id", "organization_id");



CREATE INDEX "idx_task_assignees_assigned_by" ON "public"."task_assignees" USING "btree" ("assigned_by");



CREATE INDEX "idx_task_assignees_org_person" ON "public"."task_assignees" USING "btree" ("organization_id", "person_id");



CREATE INDEX "idx_task_assignees_person_org" ON "public"."task_assignees" USING "btree" ("person_id", "organization_id");



CREATE INDEX "idx_task_assignees_task_org" ON "public"."task_assignees" USING "btree" ("task_id", "organization_id");



CREATE INDEX "idx_task_blockers_org_status" ON "public"."task_blockers" USING "btree" ("organization_id", "status", "created_at" DESC);



CREATE INDEX "idx_task_blockers_reported_by" ON "public"."task_blockers" USING "btree" ("reported_by");



CREATE INDEX "idx_task_blockers_task" ON "public"."task_blockers" USING "btree" ("task_id");



CREATE INDEX "idx_task_blockers_task_org" ON "public"."task_blockers" USING "btree" ("task_id", "organization_id");



CREATE INDEX "idx_task_comments_author" ON "public"."task_comments" USING "btree" ("author_user_id");



CREATE INDEX "idx_task_comments_org" ON "public"."task_comments" USING "btree" ("organization_id");



CREATE INDEX "idx_task_comments_task_created" ON "public"."task_comments" USING "btree" ("task_id", "created_at");



CREATE INDEX "idx_task_comments_task_org" ON "public"."task_comments" USING "btree" ("task_id", "organization_id");



CREATE INDEX "idx_task_evidence_org" ON "public"."task_evidence" USING "btree" ("organization_id");



CREATE INDEX "idx_task_evidence_task" ON "public"."task_evidence" USING "btree" ("task_id", "created_at");



CREATE INDEX "idx_task_evidence_task_org" ON "public"."task_evidence" USING "btree" ("task_id", "organization_id");



CREATE INDEX "idx_task_evidence_uploaded_by" ON "public"."task_evidence" USING "btree" ("uploaded_by");



CREATE INDEX "idx_task_time_org_date" ON "public"."task_time_entries" USING "btree" ("organization_id", "entry_date");



CREATE INDEX "idx_task_time_task" ON "public"."task_time_entries" USING "btree" ("task_id");



CREATE INDEX "idx_task_time_task_org" ON "public"."task_time_entries" USING "btree" ("task_id", "organization_id");



CREATE INDEX "idx_task_time_user" ON "public"."task_time_entries" USING "btree" ("user_id");



CREATE INDEX "idx_task_updates_org_user" ON "public"."task_updates" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_task_updates_task_created" ON "public"."task_updates" USING "btree" ("task_id", "created_at" DESC);



CREATE INDEX "idx_task_updates_task_org" ON "public"."task_updates" USING "btree" ("task_id", "organization_id");



CREATE INDEX "idx_task_updates_user" ON "public"."task_updates" USING "btree" ("user_id");



CREATE INDEX "idx_tasks_created_by" ON "public"."tasks" USING "btree" ("created_by");



CREATE INDEX "idx_tasks_org_due" ON "public"."tasks" USING "btree" ("organization_id", "due_date") WHERE ("status" <> 'done'::"text");



CREATE INDEX "idx_tasks_org_project_status" ON "public"."tasks" USING "btree" ("organization_id", "project_id", "status");



CREATE INDEX "idx_tasks_parent" ON "public"."tasks" USING "btree" ("parent_task_id");



CREATE INDEX "idx_tasks_parent_org" ON "public"."tasks" USING "btree" ("parent_task_id", "organization_id");



CREATE INDEX "idx_tasks_project_org" ON "public"."tasks" USING "btree" ("project_id", "organization_id");



CREATE INDEX "idx_tasks_reviewer_org" ON "public"."tasks" USING "btree" ("reviewer_person_id", "organization_id");



CREATE INDEX "idx_teams_created_by" ON "public"."teams" USING "btree" ("created_by");



CREATE INDEX "idx_teams_department" ON "public"."teams" USING "btree" ("department_id");



CREATE INDEX "idx_teams_department_org" ON "public"."teams" USING "btree" ("department_id", "organization_id");



CREATE INDEX "idx_teams_org_department" ON "public"."teams" USING "btree" ("organization_id", "department_id");



CREATE INDEX "idx_workspace_invitations_accepted_by" ON "public"."workspace_invitations" USING "btree" ("accepted_by");



CREATE INDEX "idx_workspace_invitations_created_by" ON "public"."workspace_invitations" USING "btree" ("created_by");



CREATE INDEX "idx_workspace_invitations_org_status" ON "public"."workspace_invitations" USING "btree" ("organization_id", "accepted_at", "expires_at");



CREATE UNIQUE INDEX "people_id_org_unique" ON "public"."people" USING "btree" ("id", "organization_id");



CREATE UNIQUE INDEX "people_org_auth_user_unique" ON "public"."people" USING "btree" ("organization_id", "auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE UNIQUE INDEX "people_org_email_unique" ON "public"."people" USING "btree" ("organization_id", "lower"("email")) WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "projects_id_org_unique" ON "public"."projects" USING "btree" ("id", "organization_id");



CREATE UNIQUE INDEX "projects_org_code_unique" ON "public"."projects" USING "btree" ("organization_id", "lower"("code")) WHERE ("code" IS NOT NULL);



CREATE INDEX "sprints_org_project_status_idx" ON "public"."sprints" USING "btree" ("organization_id", "project_id", "status");



CREATE INDEX "task_labels_org_idx" ON "public"."task_labels" USING "btree" ("organization_id");



CREATE INDEX "tasks_epic_idx" ON "public"."tasks" USING "btree" ("epic_id") WHERE ("epic_id" IS NOT NULL);



CREATE UNIQUE INDEX "tasks_id_org_unique" ON "public"."tasks" USING "btree" ("id", "organization_id");



CREATE INDEX "tasks_rank_idx" ON "public"."tasks" USING "btree" ("project_id", "rank");



CREATE INDEX "tasks_sprint_status_idx" ON "public"."tasks" USING "btree" ("sprint_id", "status") WHERE ("sprint_id" IS NOT NULL);



CREATE UNIQUE INDEX "teams_id_org_unique" ON "public"."teams" USING "btree" ("id", "organization_id");



CREATE UNIQUE INDEX "teams_org_name_unique" ON "public"."teams" USING "btree" ("organization_id", "lower"("name"));



CREATE INDEX "workspace_messages_author_idx" ON "public"."workspace_messages" USING "btree" ("author_user_id", "created_at" DESC);



CREATE INDEX "workspace_messages_org_created_idx" ON "public"."workspace_messages" USING "btree" ("organization_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "accept_workspace_invitation_trigger" BEFORE INSERT ON "public"."invitation_claims" FOR EACH ROW EXECUTE FUNCTION "private"."accept_workspace_invitation"();



CREATE OR REPLACE TRIGGER "set_departments_updated_at" BEFORE UPDATE ON "public"."departments" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_epics_updated_at" BEFORE UPDATE ON "public"."epics" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_people_updated_at" BEFORE UPDATE ON "public"."people" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_sprints_updated_at" BEFORE UPDATE ON "public"."sprints" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_task_comments_updated_at" BEFORE UPDATE ON "public"."task_comments" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_task_time_entries_updated_at" BEFORE UPDATE ON "public"."task_time_entries" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_workspace_messages_updated_at" BEFORE UPDATE ON "public"."workspace_messages" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "validate_task_planning_scope" BEFORE INSERT OR UPDATE OF "organization_id", "project_id", "sprint_id", "epic_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "private"."validate_task_planning_scope"();



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."epics"
    ADD CONSTRAINT "epics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."epics"
    ADD CONSTRAINT "epics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."epics"
    ADD CONSTRAINT "epics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."epics"
    ADD CONSTRAINT "epics_project_same_org_fk" FOREIGN KEY ("project_id", "organization_id") REFERENCES "public"."projects"("id", "organization_id");



ALTER TABLE ONLY "public"."invitation_claims"
    ADD CONSTRAINT "invitation_claims_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."workspace_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitation_claims"
    ADD CONSTRAINT "invitation_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "labels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "labels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_department_same_org_fk" FOREIGN KEY ("department_id", "organization_id") REFERENCES "public"."departments"("id", "organization_id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_manager_same_org_fk" FOREIGN KEY ("manager_id", "organization_id") REFERENCES "public"."people"("id", "organization_id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_team_same_org_fk" FOREIGN KEY ("team_id", "organization_id") REFERENCES "public"."teams"("id", "organization_id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_person_same_org_fk" FOREIGN KEY ("person_id", "organization_id") REFERENCES "public"."people"("id", "organization_id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_same_org_fk" FOREIGN KEY ("project_id", "organization_id") REFERENCES "public"."projects"("id", "organization_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_same_org_fk" FOREIGN KEY ("owner_person_id", "organization_id") REFERENCES "public"."people"("id", "organization_id");



ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_project_same_org_fk" FOREIGN KEY ("project_id", "organization_id") REFERENCES "public"."projects"("id", "organization_id");



ALTER TABLE ONLY "public"."task_approvals"
    ADD CONSTRAINT "task_approvals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_approvals"
    ADD CONSTRAINT "task_approvals_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_approvals"
    ADD CONSTRAINT "task_approvals_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_approvals"
    ADD CONSTRAINT "task_approvals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_approvals"
    ADD CONSTRAINT "task_approvals_task_same_org_fk" FOREIGN KEY ("task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_person_same_org_fk" FOREIGN KEY ("person_id", "organization_id") REFERENCES "public"."people"("id", "organization_id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_same_org_fk" FOREIGN KEY ("task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."task_blockers"
    ADD CONSTRAINT "task_blockers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_blockers"
    ADD CONSTRAINT "task_blockers_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_blockers"
    ADD CONSTRAINT "task_blockers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_blockers"
    ADD CONSTRAINT "task_blockers_task_same_org_fk" FOREIGN KEY ("task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_task_same_org_fk" FOREIGN KEY ("task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."task_evidence"
    ADD CONSTRAINT "task_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_evidence"
    ADD CONSTRAINT "task_evidence_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_evidence"
    ADD CONSTRAINT "task_evidence_task_same_org_fk" FOREIGN KEY ("task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."task_evidence"
    ADD CONSTRAINT "task_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_labels"
    ADD CONSTRAINT "task_labels_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_labels"
    ADD CONSTRAINT "task_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_labels"
    ADD CONSTRAINT "task_labels_label_same_org_fk" FOREIGN KEY ("label_id", "organization_id") REFERENCES "public"."labels"("id", "organization_id");



ALTER TABLE ONLY "public"."task_labels"
    ADD CONSTRAINT "task_labels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_labels"
    ADD CONSTRAINT "task_labels_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_labels"
    ADD CONSTRAINT "task_labels_task_same_org_fk" FOREIGN KEY ("task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."task_time_entries"
    ADD CONSTRAINT "task_time_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_time_entries"
    ADD CONSTRAINT "task_time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_time_entries"
    ADD CONSTRAINT "task_time_entries_task_same_org_fk" FOREIGN KEY ("task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."task_time_entries"
    ADD CONSTRAINT "task_time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_updates"
    ADD CONSTRAINT "task_updates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_updates"
    ADD CONSTRAINT "task_updates_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_updates"
    ADD CONSTRAINT "task_updates_task_same_org_fk" FOREIGN KEY ("task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."task_updates"
    ADD CONSTRAINT "task_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "public"."epics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_parent_same_org_fk" FOREIGN KEY ("parent_task_id", "organization_id") REFERENCES "public"."tasks"("id", "organization_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_same_org_fk" FOREIGN KEY ("project_id", "organization_id") REFERENCES "public"."projects"("id", "organization_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_reviewer_person_id_fkey" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_reviewer_same_org_fk" FOREIGN KEY ("reviewer_person_id", "organization_id") REFERENCES "public"."people"("id", "organization_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_department_same_org_fk" FOREIGN KEY ("department_id", "organization_id") REFERENCES "public"."departments"("id", "organization_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_messages"
    ADD CONSTRAINT "workspace_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."workspace_messages"
    ADD CONSTRAINT "workspace_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "departments_delete_policy" ON "public"."departments" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"]));



CREATE POLICY "departments_insert_policy" ON "public"."departments" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text"])));



CREATE POLICY "departments_select_policy" ON "public"."departments" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "departments_update_policy" ON "public"."departments" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text"]));



ALTER TABLE "public"."epics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "epics_delete_managers" ON "public"."epics" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



CREATE POLICY "epics_insert_managers" ON "public"."epics" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



CREATE POLICY "epics_select_org_members" ON "public"."epics" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "epics_update_managers" ON "public"."epics" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



ALTER TABLE "public"."invitation_claims" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invitation_claims_insert_policy" ON "public"."invitation_claims" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."labels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "labels_delete_managers" ON "public"."labels" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



CREATE POLICY "labels_insert_managers" ON "public"."labels" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



CREATE POLICY "labels_select_org_members" ON "public"."labels" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "labels_update_managers" ON "public"."labels" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_policy" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_select_policy" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_update_policy" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_members_delete_policy" ON "public"."organization_members" FOR DELETE TO "authenticated" USING (("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"]) AND ("is_owner" = false)));



CREATE POLICY "organization_members_insert_policy" ON "public"."organization_members" FOR INSERT TO "authenticated" WITH CHECK (((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("is_owner" = true) AND ("role" = 'ceo'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."organizations" "o"
  WHERE (("o"."id" = "organization_members"."organization_id") AND ("o"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"])));



CREATE POLICY "organization_members_select_policy" ON "public"."organization_members" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "organization_members_update_policy" ON "public"."organization_members" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"]));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_delete_policy" ON "public"."organizations" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("id", ARRAY['ceo'::"text"]));



CREATE POLICY "organizations_insert_policy" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "organizations_select_policy" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_org_member"("id")));



CREATE POLICY "organizations_update_policy" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("id", ARRAY['ceo'::"text", 'admin'::"text"]))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("id", ARRAY['ceo'::"text", 'admin'::"text"])));



ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "people_delete_policy" ON "public"."people" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"]));



CREATE POLICY "people_insert_policy" ON "public"."people" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"])));



CREATE POLICY "people_select_policy" ON "public"."people" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "people_update_policy" ON "public"."people" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"]));



ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_members_delete_policy" ON "public"."project_members" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



CREATE POLICY "project_members_insert_policy" ON "public"."project_members" FOR INSERT TO "authenticated" WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



CREATE POLICY "project_members_select_policy" ON "public"."project_members" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_policy" ON "public"."projects" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text"]));



CREATE POLICY "projects_insert_policy" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



CREATE POLICY "projects_select_policy" ON "public"."projects" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "projects_update_policy" ON "public"."projects" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



ALTER TABLE "public"."sprints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sprints_delete_managers" ON "public"."sprints" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



CREATE POLICY "sprints_insert_managers" ON "public"."sprints" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



CREATE POLICY "sprints_select_org_members" ON "public"."sprints" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "sprints_update_managers" ON "public"."sprints" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



ALTER TABLE "public"."task_approvals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_approvals_insert_policy" ON "public"."task_approvals" FOR INSERT TO "authenticated" WITH CHECK ((("requested_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."is_task_assignee"("task_id") OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]))));



CREATE POLICY "task_approvals_select_policy" ON "public"."task_approvals" FOR SELECT TO "authenticated" USING ((("requested_by" = ( SELECT "auth"."uid"() AS "uid")) OR ("reviewer_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'viewer'::"text"])));



CREATE POLICY "task_approvals_update_policy" ON "public"."task_approvals" FOR UPDATE TO "authenticated" USING ((("reviewer_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]))) WITH CHECK ((("reviewer_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



ALTER TABLE "public"."task_assignees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_assignees_delete_policy" ON "public"."task_assignees" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



CREATE POLICY "task_assignees_insert_policy" ON "public"."task_assignees" FOR INSERT TO "authenticated" WITH CHECK ((("assigned_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



CREATE POLICY "task_assignees_select_policy" ON "public"."task_assignees" FOR SELECT TO "authenticated" USING (("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'viewer'::"text"]) OR (EXISTS ( SELECT 1
   FROM "public"."people" "p"
  WHERE (("p"."id" = "task_assignees"."person_id") AND ("p"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."task_blockers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_blockers_insert_policy" ON "public"."task_blockers" FOR INSERT TO "authenticated" WITH CHECK ((("reported_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."is_task_assignee"("task_id") OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]))));



CREATE POLICY "task_blockers_select_policy" ON "public"."task_blockers" FOR SELECT TO "authenticated" USING ("private"."can_view_task"("task_id"));



CREATE POLICY "task_blockers_update_policy" ON "public"."task_blockers" FOR UPDATE TO "authenticated" USING ((("reported_by" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]))) WITH CHECK ((("reported_by" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



ALTER TABLE "public"."task_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_comments_delete_policy" ON "public"."task_comments" FOR DELETE TO "authenticated" USING ((("author_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text"])));



CREATE POLICY "task_comments_insert_policy" ON "public"."task_comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."can_view_task"("task_id")));



CREATE POLICY "task_comments_select_policy" ON "public"."task_comments" FOR SELECT TO "authenticated" USING ("private"."can_view_task"("task_id"));



CREATE POLICY "task_comments_update_policy" ON "public"."task_comments" FOR UPDATE TO "authenticated" USING (("author_user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("author_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."task_evidence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_evidence_delete_policy" ON "public"."task_evidence" FOR DELETE TO "authenticated" USING ((("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text"])));



CREATE POLICY "task_evidence_insert_policy" ON "public"."task_evidence" FOR INSERT TO "authenticated" WITH CHECK ((("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."is_task_assignee"("task_id") OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]))));



CREATE POLICY "task_evidence_select_policy" ON "public"."task_evidence" FOR SELECT TO "authenticated" USING ("private"."can_view_task"("task_id"));



ALTER TABLE "public"."task_labels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_labels_select_task_viewers" ON "public"."task_labels" FOR SELECT TO "authenticated" USING ("private"."can_view_task"("task_id"));



CREATE POLICY "task_labels_write_managers" ON "public"."task_labels" TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])) WITH CHECK ((("added_by" = "auth"."uid"()) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



ALTER TABLE "public"."task_time_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_time_entries_delete_policy" ON "public"."task_time_entries" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"])));



CREATE POLICY "task_time_entries_insert_policy" ON "public"."task_time_entries" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."is_task_assignee"("task_id") OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]))));



CREATE POLICY "task_time_entries_select_policy" ON "public"."task_time_entries" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'viewer'::"text"])));



CREATE POLICY "task_time_entries_update_policy" ON "public"."task_time_entries" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."task_updates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_updates_insert_policy" ON "public"."task_updates" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."is_task_assignee"("task_id") OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]))));



CREATE POLICY "task_updates_select_policy" ON "public"."task_updates" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'viewer'::"text"])));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete_policy" ON "public"."tasks" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text"]));



CREATE POLICY "tasks_insert_policy" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])));



CREATE POLICY "tasks_select_policy" ON "public"."tasks" FOR SELECT TO "authenticated" USING (("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'viewer'::"text"]) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_task_assignee"("id")));



CREATE POLICY "tasks_update_policy" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_delete_policy" ON "public"."teams" FOR DELETE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"]));



CREATE POLICY "teams_insert_policy" ON "public"."teams" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text"])));



CREATE POLICY "teams_select_policy" ON "public"."teams" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "teams_update_policy" ON "public"."teams" FOR UPDATE TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"])) WITH CHECK ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text"]));



ALTER TABLE "public"."workspace_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_invitations_delete_policy" ON "public"."workspace_invitations" FOR DELETE TO "authenticated" USING ((("accepted_at" IS NULL) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"])));



CREATE POLICY "workspace_invitations_insert_policy" ON "public"."workspace_invitations" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"])));



CREATE POLICY "workspace_invitations_select_policy" ON "public"."workspace_invitations" FOR SELECT TO "authenticated" USING ("private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"]));



ALTER TABLE "public"."workspace_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_messages_delete_own_or_admin" ON "public"."workspace_messages" FOR DELETE TO "authenticated" USING (("private"."is_org_member"("organization_id") AND (("author_user_id" = "auth"."uid"()) OR "private"."has_org_role"("organization_id", ARRAY['ceo'::"text", 'admin'::"text"]))));



CREATE POLICY "workspace_messages_insert_members" ON "public"."workspace_messages" FOR INSERT TO "authenticated" WITH CHECK ((("author_user_id" = "auth"."uid"()) AND "private"."is_org_member"("organization_id")));



CREATE POLICY "workspace_messages_select_members" ON "public"."workspace_messages" FOR SELECT TO "authenticated" USING ("private"."is_org_member"("organization_id"));



CREATE POLICY "workspace_messages_update_own" ON "public"."workspace_messages" FOR UPDATE TO "authenticated" USING ((("author_user_id" = "auth"."uid"()) AND "private"."is_org_member"("organization_id"))) WITH CHECK ((("author_user_id" = "auth"."uid"()) AND "private"."is_org_member"("organization_id")));



GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."accept_workspace_invitation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."can_view_task"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_view_task"("p_task_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."has_org_role"("p_organization_id" "uuid", "p_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_org_role"("p_organization_id" "uuid", "p_roles" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_org_member"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_org_member"("p_organization_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_task_assignee"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_task_assignee"("p_task_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."set_updated_at"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."task_belongs_to_org"("p_task_id" "uuid", "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."task_belongs_to_org"("p_task_id" "uuid", "p_organization_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."try_uuid"("p_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."try_uuid"("p_value" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_employee_profile"("p_department_id" "uuid", "p_email" "text", "p_job_title" "text", "p_manager_email" "text", "p_name" "text", "p_role" "text", "p_team_id" "uuid", "p_weekly_capacity_hours" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_employee_profile"("p_department_id" "uuid", "p_email" "text", "p_job_title" "text", "p_manager_email" "text", "p_name" "text", "p_role" "text", "p_team_id" "uuid", "p_weekly_capacity_hours" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."add_employee_profile"("p_department_id" "uuid", "p_email" "text", "p_job_title" "text", "p_manager_email" "text", "p_name" "text", "p_role" "text", "p_team_id" "uuid", "p_weekly_capacity_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_employee_profile"("p_department_id" "uuid", "p_email" "text", "p_job_title" "text", "p_manager_email" "text", "p_name" "text", "p_role" "text", "p_team_id" "uuid", "p_weekly_capacity_hours" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_workspace"("p_name" "text", "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text", "p_timezone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text", "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text", "p_timezone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_access_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_access_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_access_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_access_context"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_task_blocker"("p_reason" "text", "p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_task_blocker"("p_reason" "text", "p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."report_task_blocker"("p_reason" "text", "p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_task_blocker"("p_reason" "text", "p_task_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_task_for_review"("p_message" "text", "p_reviewer_email" "text", "p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_task_for_review"("p_message" "text", "p_reviewer_email" "text", "p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_task_for_review"("p_message" "text", "p_reviewer_email" "text", "p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_task_for_review"("p_message" "text", "p_reviewer_email" "text", "p_task_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_task_progress"("p_hours_spent" numeric, "p_message" "text", "p_progress" smallint, "p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_task_progress"("p_hours_spent" numeric, "p_message" "text", "p_progress" smallint, "p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_task_progress"("p_hours_spent" numeric, "p_message" "text", "p_progress" smallint, "p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_task_progress"("p_hours_spent" numeric, "p_message" "text", "p_progress" smallint, "p_task_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."epics" TO "anon";
GRANT ALL ON TABLE "public"."epics" TO "authenticated";
GRANT ALL ON TABLE "public"."epics" TO "service_role";



GRANT ALL ON TABLE "public"."invitation_claims" TO "service_role";
GRANT INSERT ON TABLE "public"."invitation_claims" TO "authenticated";



GRANT ALL ON TABLE "public"."labels" TO "anon";
GRANT ALL ON TABLE "public"."labels" TO "authenticated";
GRANT ALL ON TABLE "public"."labels" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."organization_members" TO "authenticated";



GRANT ALL ON TABLE "public"."organizations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."organizations" TO "authenticated";



GRANT ALL ON TABLE "public"."people" TO "authenticated";
GRANT ALL ON TABLE "public"."people" TO "service_role";



GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."sprints" TO "anon";
GRANT ALL ON TABLE "public"."sprints" TO "authenticated";
GRANT ALL ON TABLE "public"."sprints" TO "service_role";



GRANT ALL ON TABLE "public"."task_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."task_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."task_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."task_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."task_blockers" TO "authenticated";
GRANT ALL ON TABLE "public"."task_blockers" TO "service_role";



GRANT ALL ON TABLE "public"."task_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."task_comments" TO "service_role";



GRANT ALL ON TABLE "public"."task_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."task_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."task_labels" TO "anon";
GRANT ALL ON TABLE "public"."task_labels" TO "authenticated";
GRANT ALL ON TABLE "public"."task_labels" TO "service_role";



GRANT ALL ON TABLE "public"."task_time_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."task_time_entries" TO "service_role";



GRANT ALL ON TABLE "public"."task_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."task_updates" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invitations" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."workspace_invitations" TO "authenticated";



GRANT ALL ON TABLE "public"."workspace_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_messages" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








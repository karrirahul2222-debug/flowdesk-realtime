-- Organization-wide workspace chat. Additive only; existing data is untouched.

begin;

create table public.workspace_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index workspace_messages_org_created_at_idx
  on public.workspace_messages(organization_id, created_at);

alter table public.workspace_messages enable row level security;

create policy "workspace_messages_select_active_members"
on public.workspace_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members memberships
    where memberships.organization_id = workspace_messages.organization_id
      and memberships.user_id = (select auth.uid())
      and memberships.active
  )
);

create policy "workspace_messages_insert_active_members"
on public.workspace_messages
for insert
to authenticated
with check (
  author_user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_members memberships
    where memberships.organization_id = workspace_messages.organization_id
      and memberships.user_id = (select auth.uid())
      and memberships.active
  )
);

grant select, insert on public.workspace_messages to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_messages'
  ) then
    alter publication supabase_realtime add table public.workspace_messages;
  end if;
end $$;

commit;

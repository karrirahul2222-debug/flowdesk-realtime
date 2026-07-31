-- Review-only migration: do not apply to production before testing on a Supabase branch.
-- Keeps task-evidence private and aligns object paths with org/project/task/uuid-filename.

update storage.buckets
set public = false, file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
where id = 'task-evidence';

drop policy if exists task_evidence_storage_insert on storage.objects;
drop policy if exists task_evidence_storage_select on storage.objects;
drop policy if exists task_evidence_storage_delete on storage.objects;

create policy task_evidence_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'task-evidence' and cardinality(storage.foldername(name)) = 3
  and private.task_belongs_to_org(private.try_uuid((storage.foldername(name))[3]), private.try_uuid((storage.foldername(name))[1]))
  and exists (select 1 from public.tasks t where t.id = private.try_uuid((storage.foldername(name))[3]) and t.project_id = private.try_uuid((storage.foldername(name))[2]) and t.organization_id = private.try_uuid((storage.foldername(name))[1]) and private.can_view_task(t.id))
);

create policy task_evidence_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'task-evidence' and cardinality(storage.foldername(name)) = 3
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]+$'
  and private.task_belongs_to_org(private.try_uuid((storage.foldername(name))[3]), private.try_uuid((storage.foldername(name))[1]))
  and exists (select 1 from public.tasks t where t.id = private.try_uuid((storage.foldername(name))[3]) and t.project_id = private.try_uuid((storage.foldername(name))[2]) and t.organization_id = private.try_uuid((storage.foldername(name))[1]) and (private.has_org_role(t.organization_id, array['ceo', 'admin', 'manager', 'team_lead']) or exists (select 1 from public.task_assignees ta join public.people p on p.id = ta.person_id where ta.task_id = t.id and p.auth_user_id = auth.uid())))
);

create policy task_evidence_storage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'task-evidence' and cardinality(storage.foldername(name)) = 3
  and exists (select 1 from public.tasks t where t.id = private.try_uuid((storage.foldername(name))[3]) and t.project_id = private.try_uuid((storage.foldername(name))[2]) and t.organization_id = private.try_uuid((storage.foldername(name))[1]) and (private.has_org_role(t.organization_id, array['ceo', 'admin', 'manager', 'team_lead']) or exists (select 1 from public.task_assignees ta join public.people p on p.id = ta.person_id where ta.task_id = t.id and p.auth_user_id = auth.uid())))
);

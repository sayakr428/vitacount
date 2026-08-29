-- Security sweep findings, both confirmed exploitable and fixed here.
--
-- 1. `receipts` storage RLS was bucket-wide (bucket_id = 'receipts' only), with
--    no check that the object path's tenant-folder prefix matches the caller's
--    own tenant. Every other table in this project scopes RLS by
--    tenant_id in (select current_tenant_ids()); this storage policy was the
--    one place that didn't, even though the app relies entirely on the
--    "${tenantId}/..." path convention (apps/web/lib/actions/documents.ts) as
--    the tenant boundary. Any authenticated user of any tenant could
--    list/download/upload into any other tenant's receipts folder directly via
--    the Storage SDK (browser holds a valid session + the public anon key,
--    same as any other Supabase Storage access) — a real cross-tenant PII/
--    financial-document leak, not a theoretical one.
drop policy "Authenticated users can upload receipts" on storage.objects;
drop policy "Authenticated users can view receipts" on storage.objects;

create policy "Tenant members can upload their own tenant receipts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (select public.current_tenant_ids())
  );

create policy "Tenant members can view their own tenant receipts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1]::uuid in (select public.current_tenant_ids())
  );

-- 2. set_agent_autonomy_level / emergency_kill_switch resolved "the" caller's
--    tenant via a bare, unordered `select tenant_id from memberships where
--    user_id = auth.uid() limit 1` with no role check at all — unlike every
--    other privileged write in this project (current_admin_tenant_ids(),
--    tenants_update_admin RLS, every GL-posting RPC's role gate). Because these
--    are SECURITY DEFINER, they bypass tenants' own RLS entirely, so the
--    missing check wasn't backstopped by anything: any active member of ANY
--    role — including 'viewer'/'staff' — could disable every AI agent
--    tenant-wide (emergency_kill_switch) or raise an agent's autonomy level
--    (set_agent_autonomy_level) with no owner/admin approval. Fixed by taking
--    an explicit p_tenant_id (validated against an active owner/admin
--    membership) instead of guessing at "the" tenant, matching the
--    current_admin_tenant_ids() pattern used everywhere else.
drop function if exists public.set_agent_autonomy_level(text, integer);
drop function if exists public.emergency_kill_switch();

create or replace function public.set_agent_autonomy_level(
  p_tenant_id uuid,
  p_agent_name text,
  p_level integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
begin
  if not exists (
    select 1 from public.memberships
    where tenant_id = p_tenant_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'admin')
  ) then
    raise exception 'not authorized: owner/admin role required for this tenant';
  end if;

  select coalesce(settings, '{}'::jsonb) into v_settings
  from public.tenants
  where id = p_tenant_id;

  v_settings := jsonb_set(v_settings, array['agent_policies', p_agent_name], to_jsonb(p_level));

  update public.tenants
  set settings = v_settings
  where id = p_tenant_id;

  return v_settings;
end;
$$;

create or replace function public.emergency_kill_switch(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
begin
  if not exists (
    select 1 from public.memberships
    where tenant_id = p_tenant_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'admin')
  ) then
    raise exception 'not authorized: owner/admin role required for this tenant';
  end if;

  select coalesce(settings, '{}'::jsonb) into v_settings
  from public.tenants
  where id = p_tenant_id;

  v_settings := jsonb_set(v_settings, '{agent_policies}', '{"ap_bookkeeping_agent": 0, "reconciliation_agent": 0, "ar_collections_agent": 0}'::jsonb);

  update public.tenants
  set settings = v_settings
  where id = p_tenant_id;

  return v_settings;
end;
$$;

revoke execute on function public.set_agent_autonomy_level(uuid, text, integer) from public, anon;
revoke execute on function public.emergency_kill_switch(uuid) from public, anon;
grant execute on function public.set_agent_autonomy_level(uuid, text, integer) to authenticated;
grant execute on function public.emergency_kill_switch(uuid) to authenticated;

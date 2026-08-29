-- Session 12: Agent Control Plane & Production Hardening

-- RPC function to update per-agent autonomy level in tenants.settings
create or replace function public.set_agent_autonomy_level(
  p_agent_name text,
  p_level integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_settings jsonb;
begin
  -- Find active user tenant
  select tenant_id into v_tenant_id
  from public.memberships
  where user_id = auth.uid()
  limit 1;

  if v_tenant_id is null then
    raise exception 'No active tenant membership found for user';
  end if;

  -- Get current settings
  select coalesce(settings, '{}'::jsonb) into v_settings
  from public.tenants
  where id = v_tenant_id;

  -- Update agent autonomy level key
  v_settings := jsonb_set(v_settings, array['agent_policies', p_agent_name], to_jsonb(p_level));

  update public.tenants
  set settings = v_settings
  where id = v_tenant_id;

  return v_settings;
end;
$$;

-- RPC function for Emergency Agent Kill-Switch (sets all agents to L0)
create or replace function public.emergency_kill_switch()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_settings jsonb;
begin
  select tenant_id into v_tenant_id
  from public.memberships
  where user_id = auth.uid()
  limit 1;

  if v_tenant_id is null then
    raise exception 'No active tenant membership found for user';
  end if;

  select coalesce(settings, '{}'::jsonb) into v_settings
  from public.tenants
  where id = v_tenant_id;

  v_settings := jsonb_set(v_settings, '{agent_policies}', '{"ap_bookkeeping_agent": 0, "reconciliation_agent": 0, "ar_collections_agent": 0}'::jsonb);

  update public.tenants
  set settings = v_settings
  where id = v_tenant_id;

  return v_settings;
end;
$$;

-- Security Hardening: Revoke public execution from all custom control functions
revoke execute on function public.set_agent_autonomy_level from public, anon;
revoke execute on function public.emergency_kill_switch from public, anon;
grant execute on function public.set_agent_autonomy_level to authenticated;
grant execute on function public.emergency_kill_switch to authenticated;

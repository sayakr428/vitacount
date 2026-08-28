-- Session 2: profiles, tenants, memberships + RLS + onboarding/invite helpers

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_tier text not null default 'starter' check (plan_tier in ('starter','growth','pro')),
  base_currency text not null default 'USD',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','accountant','staff','viewer')),
  permissions jsonb not null default '{}',
  invited_at timestamptz default now(),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  unique (tenant_id, user_id)
);

create index memberships_user_tenant_idx on memberships (user_id, tenant_id);
create index memberships_tenant_idx on memberships (tenant_id);

-- auto-create a profile row whenever a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- security-definer helpers, used by RLS policies instead of repeating subqueries
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id from memberships
  where user_id = auth.uid() and status = 'active';
$$;

create or replace function public.current_admin_tenant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id from memberships
  where user_id = auth.uid() and status = 'active' and role in ('owner','admin');
$$;

create or replace function public.current_member_tenant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id from memberships
  where user_id = auth.uid();
$$;

grant execute on function public.current_tenant_ids() to authenticated;
grant execute on function public.current_admin_tenant_ids() to authenticated;
grant execute on function public.current_member_tenant_ids() to authenticated;

-- onboarding: atomically create a tenant + its owner membership
create or replace function public.create_tenant(tenant_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into tenants (name) values (tenant_name) returning id into new_tenant_id;

  insert into memberships (tenant_id, user_id, role, status)
  values (new_tenant_id, auth.uid(), 'owner', 'active');

  return new_tenant_id;
end;
$$;

grant execute on function public.create_tenant(text) to authenticated;

-- accept a pending invite: flips the caller's own membership row to active
create or replace function public.accept_invite(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update memberships
  set status = 'active'
  where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'invited';
end;
$$;

grant execute on function public.accept_invite(uuid) to authenticated;

-- RLS
alter table profiles enable row level security;
alter table tenants enable row level security;
alter table memberships enable row level security;

create policy "profiles_select" on profiles
  for select using (
    id = auth.uid()
    or id in (select user_id from memberships where tenant_id in (select current_tenant_ids()))
  );

create policy "profiles_update_own" on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy "tenants_select" on tenants
  for select using (id in (select current_member_tenant_ids()));

create policy "tenants_update_admin" on tenants
  for update using (id in (select current_admin_tenant_ids()))
  with check (id in (select current_admin_tenant_ids()));

create policy "memberships_select" on memberships
  for select using (
    tenant_id in (select current_tenant_ids())
    or user_id = auth.uid()
  );

create policy "memberships_insert_admin" on memberships
  for insert with check (tenant_id in (select current_admin_tenant_ids()));

create policy "memberships_update_admin" on memberships
  for update using (tenant_id in (select current_admin_tenant_ids()))
  with check (tenant_id in (select current_admin_tenant_ids()));

create policy "memberships_update_self_accept" on memberships
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "memberships_delete_admin" on memberships
  for delete using (tenant_id in (select current_admin_tenant_ids()));

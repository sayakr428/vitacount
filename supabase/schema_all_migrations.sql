-- ==========================================
-- File: 20260827193521_auth_foundation.sql
-- ==========================================
-- Session 2: profiles, tenants, memberships + RLS + onboarding/invite helpers

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_tier text not null default 'starter' check (plan_tier in ('starter','growth','pro')),
  base_currency text not null default 'USD',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','accountant','staff','viewer')),
  permissions jsonb not null default '{}',
  invited_at timestamptz default now(),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  unique (tenant_id, user_id)
);

create index if not exists memberships_user_tenant_idx on memberships (user_id, tenant_id);
create index if not exists memberships_tenant_idx on memberships (tenant_id);

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

drop trigger if exists "on_auth_user_created" on auth.users;
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

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select using (
    id = auth.uid()
    or id in (select user_id from memberships where tenant_id in (select current_tenant_ids()))
  );

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "tenants_select" on tenants;
create policy "tenants_select" on tenants
  for select using (id in (select current_member_tenant_ids()));

drop policy if exists "tenants_update_admin" on tenants;
create policy "tenants_update_admin" on tenants
  for update using (id in (select current_admin_tenant_ids()))
  with check (id in (select current_admin_tenant_ids()));

drop policy if exists "memberships_select" on memberships;
create policy "memberships_select" on memberships
  for select using (
    tenant_id in (select current_tenant_ids())
    or user_id = auth.uid()
  );

drop policy if exists "memberships_insert_admin" on memberships;
create policy "memberships_insert_admin" on memberships
  for insert with check (tenant_id in (select current_admin_tenant_ids()));

drop policy if exists "memberships_update_admin" on memberships;
create policy "memberships_update_admin" on memberships
  for update using (tenant_id in (select current_admin_tenant_ids()))
  with check (tenant_id in (select current_admin_tenant_ids()));

drop policy if exists "memberships_update_self_accept" on memberships;
create policy "memberships_update_self_accept" on memberships
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "memberships_delete_admin" on memberships;
create policy "memberships_delete_admin" on memberships
  for delete using (tenant_id in (select current_admin_tenant_ids()));



-- ==========================================
-- File: 20260827193547_auth_foundation_lockdown_function_grants.sql
-- ==========================================
-- Functions default to PUBLIC-executable; lock these down to authenticated only
-- (handle_new_user is trigger-only and needs no explicit grant at all).

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.current_tenant_ids() from public, anon;
revoke execute on function public.current_admin_tenant_ids() from public, anon;
revoke execute on function public.current_member_tenant_ids() from public, anon;
revoke execute on function public.create_tenant(text) from public, anon;
revoke execute on function public.accept_invite(uuid) from public, anon;



-- ==========================================
-- File: 20260827193611_auth_foundation_lockdown_handle_new_user.sql
-- ==========================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;



-- ==========================================
-- File: 20260827194042_auth_foundation_lookup_user_by_email.sql
-- ==========================================
-- Lets an owner/admin resolve an existing auth user by email, so the invite
-- flow can add an already-registered person to a second tenant without
-- Supabase's inviteUserByEmail erroring on a duplicate account.
create or replace function public.lookup_user_id_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_id uuid;
begin
  if not exists (
    select 1 from memberships
    where user_id = auth.uid() and status = 'active' and role in ('owner','admin')
  ) then
    raise exception 'not authorized';
  end if;

  select id into found_id from auth.users where email = p_email;
  return found_id;
end;
$$;

revoke execute on function public.lookup_user_id_by_email(text) from public, anon;
grant execute on function public.lookup_user_id_by_email(text) to authenticated;



-- ==========================================
-- File: 20260827194928_financial_core.sql
-- ==========================================
-- Session 3: Financial Core — Chart of Accounts, dimensions, periods, GL

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  subtype text,
  is_active boolean not null default true,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists dimension_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  is_active boolean not null default true
);

create table if not exists dimension_values (
  id uuid primary key default gen_random_uuid(),
  dimension_type_id uuid not null references dimension_types(id),
  tenant_id uuid not null references tenants(id),
  value text not null,
  is_active boolean not null default true
);

create table if not exists periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','closed','locked')),
  unique (tenant_id, start_date, end_date)
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  entry_date date not null,
  memo text,
  source_type text not null,
  source_id uuid,
  status text not null default 'posted' check (status in ('draft','posted','void')),
  period_id uuid references periods(id),
  created_by uuid references auth.users(id),
  posted_at timestamptz,
  reversal_of_id uuid references journal_entries(id),
  created_at timestamptz not null default now()
);

create table if not exists journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references accounts(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  memo text,
  check (debit >= 0 and credit >= 0 and not (debit > 0 and credit > 0))
);

create table if not exists journal_entry_line_dimensions (
  journal_entry_line_id uuid not null references journal_entry_lines(id) on delete cascade,
  dimension_value_id uuid not null references dimension_values(id),
  primary key (journal_entry_line_id, dimension_value_id)
);

create index if not exists accounts_tenant_idx on accounts (tenant_id);
create index if not exists journal_entries_tenant_date_idx on journal_entries (tenant_id, entry_date);
create index if not exists journal_entry_lines_entry_idx on journal_entry_lines (journal_entry_id);
create index if not exists journal_entry_lines_account_idx on journal_entry_lines (account_id);
create index if not exists journal_entry_lines_tenant_account_idx on journal_entry_lines (journal_entry_id, account_id);

-- Posting-engine invariant: it is structurally impossible to post an unbalanced entry.
create or replace function enforce_balanced_entry() returns trigger as $$
declare total_debit numeric; total_credit numeric;
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into total_debit, total_credit
    from journal_entry_lines where journal_entry_id = new.journal_entry_id;
  if total_debit <> total_credit then
    raise exception 'Journal entry % is unbalanced: debit % != credit %', new.journal_entry_id, total_debit, total_credit;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists "check_balanced" on journal_entry_lines;
create constraint trigger check_balanced
  after insert or update on journal_entry_lines
  deferrable initially deferred
  for each row execute function enforce_balanced_entry();

-- RLS
alter table accounts enable row level security;
alter table dimension_types enable row level security;
alter table dimension_values enable row level security;
alter table periods enable row level security;
alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;
alter table journal_entry_line_dimensions enable row level security;

drop policy if exists "accounts_select" on accounts;
create policy "accounts_select" on accounts for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "accounts_insert" on accounts;
create policy "accounts_insert" on accounts for insert with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "accounts_update" on accounts;
create policy "accounts_update" on accounts for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "accounts_delete" on accounts;
create policy "accounts_delete" on accounts for delete using (tenant_id in (select current_admin_tenant_ids()));

drop policy if exists "dimension_types_select" on dimension_types;
create policy "dimension_types_select" on dimension_types for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "dimension_types_write" on dimension_types;
create policy "dimension_types_write" on dimension_types for insert with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "dimension_types_update" on dimension_types;
create policy "dimension_types_update" on dimension_types for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "dimension_types_delete" on dimension_types;
create policy "dimension_types_delete" on dimension_types for delete using (tenant_id in (select current_admin_tenant_ids()));

drop policy if exists "dimension_values_select" on dimension_values;
create policy "dimension_values_select" on dimension_values for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "dimension_values_write" on dimension_values;
create policy "dimension_values_write" on dimension_values for insert with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "dimension_values_update" on dimension_values;
create policy "dimension_values_update" on dimension_values for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "dimension_values_delete" on dimension_values;
create policy "dimension_values_delete" on dimension_values for delete using (tenant_id in (select current_admin_tenant_ids()));

drop policy if exists "periods_select" on periods;
create policy "periods_select" on periods for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "periods_write" on periods;
create policy "periods_write" on periods for insert with check (tenant_id in (select current_admin_tenant_ids()));
drop policy if exists "periods_update" on periods;
create policy "periods_update" on periods for update using (tenant_id in (select current_admin_tenant_ids())) with check (tenant_id in (select current_admin_tenant_ids()));

drop policy if exists "journal_entries_select" on journal_entries;
create policy "journal_entries_select" on journal_entries for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "only_accountant_plus_can_post_journal_entries" on journal_entries;
create policy "only_accountant_plus_can_post_journal_entries" on journal_entries
  for insert with check (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid() and status = 'active' and role in ('owner','admin','accountant')
    )
  );
drop policy if exists "journal_entries_update" on journal_entries;
create policy "journal_entries_update" on journal_entries
  for update using (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid() and status = 'active' and role in ('owner','admin','accountant')
    )
  ) with check (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid() and status = 'active' and role in ('owner','admin','accountant')
    )
  );

drop policy if exists "journal_entry_lines_select" on journal_entry_lines;
create policy "journal_entry_lines_select" on journal_entry_lines
  for select using (
    journal_entry_id in (select id from journal_entries where tenant_id in (select current_tenant_ids()))
  );
drop policy if exists "journal_entry_lines_insert" on journal_entry_lines;
create policy "journal_entry_lines_insert" on journal_entry_lines
  for insert with check (
    journal_entry_id in (
      select je.id from journal_entries je
      join memberships m on m.tenant_id = je.tenant_id
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','accountant')
    )
  );
drop policy if exists "journal_entry_lines_delete" on journal_entry_lines;
create policy "journal_entry_lines_delete" on journal_entry_lines
  for delete using (
    journal_entry_id in (
      select je.id from journal_entries je
      join memberships m on m.tenant_id = je.tenant_id
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','accountant')
    )
  );

drop policy if exists "journal_entry_line_dimensions_select" on journal_entry_line_dimensions;
create policy "journal_entry_line_dimensions_select" on journal_entry_line_dimensions
  for select using (
    journal_entry_line_id in (
      select jel.id from journal_entry_lines jel
      join journal_entries je on je.id = jel.journal_entry_id
      where je.tenant_id in (select current_tenant_ids())
    )
  );
drop policy if exists "journal_entry_line_dimensions_insert" on journal_entry_line_dimensions;
create policy "journal_entry_line_dimensions_insert" on journal_entry_line_dimensions
  for insert with check (
    journal_entry_line_id in (
      select jel.id from journal_entry_lines jel
      join journal_entries je on je.id = jel.journal_entry_id
      join memberships m on m.tenant_id = je.tenant_id
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','accountant')
    )
  );



-- ==========================================
-- File: 20260827195004_financial_core_default_coa.sql
-- ==========================================
-- Default US Chart of Accounts, seeded automatically on tenant creation.
--
-- NOTE: this version has a bug — "Owner's Equity" below uses double quotes,
-- which Postgres parses as a quoted *identifier*, not a string literal. It
-- was caught immediately (before any real tenant relied on it) and fixed in
-- the next migration (financial_core_default_coa_fix_quoting). Kept as-is
-- here since migrations are an append-only log — see CONTEXT_LOG.md.

create or replace function public.seed_default_chart_of_accounts(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into accounts (tenant_id, code, name, type, subtype) values
    (p_tenant_id, '1000', 'Cash', 'asset', 'current_asset'),
    (p_tenant_id, '1010', 'Accounts Receivable', 'asset', 'current_asset'),
    (p_tenant_id, '1020', 'Undeposited Funds', 'asset', 'current_asset'),
    (p_tenant_id, '1200', 'Inventory Asset', 'asset', 'current_asset'),
    (p_tenant_id, '2000', 'Accounts Payable', 'liability', 'current_liability'),
    (p_tenant_id, '2010', 'Sales Tax Payable', 'liability', 'current_liability'),
    (p_tenant_id, '2020', 'Credit Card Payable', 'liability', 'current_liability'),
    (p_tenant_id, '3000', "Owner's Equity", 'equity', null),
    (p_tenant_id, '3010', 'Retained Earnings', 'equity', null),
    (p_tenant_id, '4000', 'Sales Revenue', 'revenue', null),
    (p_tenant_id, '4010', 'Service Revenue', 'revenue', null),
    (p_tenant_id, '5000', 'Cost of Goods Sold', 'expense', 'cogs'),
    (p_tenant_id, '6000', 'Advertising & Marketing', 'expense', 'operating_expense'),
    (p_tenant_id, '6010', 'Bank Fees & Charges', 'expense', 'operating_expense'),
    (p_tenant_id, '6020', 'Insurance', 'expense', 'operating_expense'),
    (p_tenant_id, '6030', 'Office Supplies', 'expense', 'operating_expense'),
    (p_tenant_id, '6040', 'Payroll Expenses', 'expense', 'operating_expense'),
    (p_tenant_id, '6050', 'Professional Fees', 'expense', 'operating_expense'),
    (p_tenant_id, '6060', 'Rent Expense', 'expense', 'operating_expense'),
    (p_tenant_id, '6070', 'Software & Subscriptions', 'expense', 'operating_expense'),
    (p_tenant_id, '6080', 'Travel & Meals', 'expense', 'operating_expense'),
    (p_tenant_id, '6090', 'Utilities', 'expense', 'operating_expense'),
    (p_tenant_id, '6900', 'Uncategorized Expense', 'expense', 'operating_expense');
end;
$$;

revoke execute on function public.seed_default_chart_of_accounts(uuid) from public, anon, authenticated;

-- hook the seed into onboarding
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

  perform seed_default_chart_of_accounts(new_tenant_id);

  return new_tenant_id;
end;
$$;



-- ==========================================
-- File: 20260827195029_financial_core_default_coa_fix_quoting.sql
-- ==========================================
-- Fixes the "Owner's Equity" identifier/string-literal bug from the previous
-- migration (double-quoted -> properly escaped single-quoted string).
create or replace function public.seed_default_chart_of_accounts(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into accounts (tenant_id, code, name, type, subtype) values
    (p_tenant_id, '1000', 'Cash', 'asset', 'current_asset'),
    (p_tenant_id, '1010', 'Accounts Receivable', 'asset', 'current_asset'),
    (p_tenant_id, '1020', 'Undeposited Funds', 'asset', 'current_asset'),
    (p_tenant_id, '1200', 'Inventory Asset', 'asset', 'current_asset'),
    (p_tenant_id, '2000', 'Accounts Payable', 'liability', 'current_liability'),
    (p_tenant_id, '2010', 'Sales Tax Payable', 'liability', 'current_liability'),
    (p_tenant_id, '2020', 'Credit Card Payable', 'liability', 'current_liability'),
    (p_tenant_id, '3000', 'Owner''s Equity', 'equity', null),
    (p_tenant_id, '3010', 'Retained Earnings', 'equity', null),
    (p_tenant_id, '4000', 'Sales Revenue', 'revenue', null),
    (p_tenant_id, '4010', 'Service Revenue', 'revenue', null),
    (p_tenant_id, '5000', 'Cost of Goods Sold', 'expense', 'cogs'),
    (p_tenant_id, '6000', 'Advertising & Marketing', 'expense', 'operating_expense'),
    (p_tenant_id, '6010', 'Bank Fees & Charges', 'expense', 'operating_expense'),
    (p_tenant_id, '6020', 'Insurance', 'expense', 'operating_expense'),
    (p_tenant_id, '6030', 'Office Supplies', 'expense', 'operating_expense'),
    (p_tenant_id, '6040', 'Payroll Expenses', 'expense', 'operating_expense'),
    (p_tenant_id, '6050', 'Professional Fees', 'expense', 'operating_expense'),
    (p_tenant_id, '6060', 'Rent Expense', 'expense', 'operating_expense'),
    (p_tenant_id, '6070', 'Software & Subscriptions', 'expense', 'operating_expense'),
    (p_tenant_id, '6080', 'Travel & Meals', 'expense', 'operating_expense'),
    (p_tenant_id, '6090', 'Utilities', 'expense', 'operating_expense'),
    (p_tenant_id, '6900', 'Uncategorized Expense', 'expense', 'operating_expense');
end;
$$;



-- ==========================================
-- File: 20260827195134_financial_core_fix_trigger_search_path.sql
-- ==========================================
create or replace function enforce_balanced_entry() returns trigger as $$
declare total_debit numeric; total_credit numeric;
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into total_debit, total_credit
    from journal_entry_lines where journal_entry_id = new.journal_entry_id;
  if total_debit <> total_credit then
    raise exception 'Journal entry % is unbalanced: debit % != credit %', new.journal_entry_id, total_debit, total_credit;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;



-- ==========================================
-- File: 20260827195329_financial_core_post_manual_journal_entry.sql
-- ==========================================
-- Runs as the caller (not security definer), so the existing RLS policies on
-- journal_entries/journal_entry_lines are the real authorization check — this
-- function's only job is making the header + lines insert one transaction,
-- so the deferred balanced-entry trigger rolls back the whole entry, not
-- just the lines, if it fails.
create or replace function public.post_manual_journal_entry(
  p_tenant_id uuid,
  p_entry_date date,
  p_memo text,
  p_lines jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_entry_id uuid;
  line jsonb;
begin
  insert into journal_entries (tenant_id, entry_date, memo, source_type, status, posted_at, created_by)
  values (p_tenant_id, p_entry_date, p_memo, 'manual', 'posted', now(), auth.uid())
  returning id into new_entry_id;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
    values (
      new_entry_id,
      (line->>'accountId')::uuid,
      coalesce((line->>'debit')::numeric, 0),
      coalesce((line->>'credit')::numeric, 0),
      line->>'memo'
    );
  end loop;

  return new_entry_id;
end;
$$;

grant execute on function public.post_manual_journal_entry(uuid, date, text, jsonb) to authenticated;
revoke execute on function public.post_manual_journal_entry(uuid, date, text, jsonb) from public, anon;



-- ==========================================
-- File: 20260827204327_contacts_and_ar.sql
-- ==========================================
-- Session 4: Contacts + Accounts Receivable
--
-- Schema deviations from project.md Part 2.3/2.4, both documented in CONTEXT_LOG.md:
--   - invoices.project_id / invoice_lines.item_id are plain nullable uuid columns with
--     NO foreign key yet, since the Projects and Inventory modules (which own the
--     `projects`/`items` tables) aren't built. The FK gets added in the migration that
--     creates those tables.
--   - tenants.default_tax_rate is a new column: the flat-rate placeholder tax calc the
--     playbook calls for (TaxJar/Avalara integration is explicitly deferred post-MVP).

alter table tenants add column if not exists default_tax_rate numeric(6,4) not null default 0;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  type text not null check (type in ('customer', 'vendor', 'both')),
  display_name text not null,
  email text,
  phone text,
  billing_address jsonb,
  shipping_address jsonb,
  tax_id text,
  payment_terms text not null default 'net_30',
  credit_limit numeric(14, 2),
  is_1099_vendor boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists contacts_tenant_idx on contacts (tenant_id);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  project_id uuid,
  invoice_number text not null,
  issue_date date not null,
  due_date date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partial', 'paid', 'overdue', 'void')),
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  balance_due numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create index if not exists invoices_tenant_idx on invoices (tenant_id);
create index if not exists invoices_contact_idx on invoices (contact_id);
create index if not exists invoices_tenant_status_idx on invoices (tenant_id, status);

create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  item_id uuid,
  description text,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(14, 2) not null,
  tax_rate numeric(6, 4) not null default 0,
  amount numeric(14, 2) not null,
  sort_order int not null default 0
);

create index if not exists invoice_lines_invoice_idx on invoice_lines (invoice_id);

create table if not exists payments_received (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  payment_date date not null,
  amount numeric(14, 2) not null,
  method text,
  reference text,
  stripe_payment_intent_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists payments_received_tenant_idx on payments_received (tenant_id);
create index if not exists payments_received_contact_idx on payments_received (contact_id);

create table if not exists payment_applications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments_received(id) on delete cascade,
  invoice_id uuid not null references invoices(id),
  amount_applied numeric(14, 2) not null
);

create index if not exists payment_applications_payment_idx on payment_applications (payment_id);
create index if not exists payment_applications_invoice_idx on payment_applications (invoice_id);

-- next_invoice_number: simple per-tenant sequential numbering, "INV-0001" style.
-- Not gap-free under concurrent inserts (no advisory lock) — acceptable for MVP
-- invoice numbering, which only needs to be unique and roughly sequential, not
-- a strict audit-grade sequence.
create or replace function public.next_invoice_number(p_tenant_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select 'INV-' || lpad((count(*) + 1)::text, 4, '0')
  from invoices
  where tenant_id = p_tenant_id;
$$;

grant execute on function public.next_invoice_number(uuid) to authenticated;

-- RLS
alter table contacts enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table payments_received enable row level security;
alter table payment_applications enable row level security;

drop policy if exists "contacts_select" on contacts;
create policy "contacts_select" on contacts for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "contacts_insert" on contacts;
create policy "contacts_insert" on contacts for insert with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "contacts_update" on contacts;
create policy "contacts_update" on contacts for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "contacts_delete" on contacts;
create policy "contacts_delete" on contacts for delete using (tenant_id in (select current_admin_tenant_ids()));

drop policy if exists "invoices_select" on invoices;
create policy "invoices_select" on invoices for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "invoices_insert" on invoices;
create policy "invoices_insert" on invoices for insert with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "invoices_update" on invoices;
create policy "invoices_update" on invoices for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "invoices_delete" on invoices;
create policy "invoices_delete" on invoices for delete using (tenant_id in (select current_admin_tenant_ids()) and status = 'draft');

drop policy if exists "invoice_lines_select" on invoice_lines;
create policy "invoice_lines_select" on invoice_lines for select using (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
);
drop policy if exists "invoice_lines_insert" on invoice_lines;
create policy "invoice_lines_insert" on invoice_lines for insert with check (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
);
drop policy if exists "invoice_lines_update" on invoice_lines;
create policy "invoice_lines_update" on invoice_lines for update using (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
) with check (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
);
drop policy if exists "invoice_lines_delete" on invoice_lines;
create policy "invoice_lines_delete" on invoice_lines for delete using (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
);

drop policy if exists "payments_received_select" on payments_received;
create policy "payments_received_select" on payments_received for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "payments_received_insert" on payments_received;
create policy "payments_received_insert" on payments_received for insert with check (tenant_id in (select current_tenant_ids()));

drop policy if exists "payment_applications_select" on payment_applications;
create policy "payment_applications_select" on payment_applications for select using (
  payment_id in (select id from payments_received where tenant_id in (select current_tenant_ids()))
);
drop policy if exists "payment_applications_insert" on payment_applications;
create policy "payment_applications_insert" on payment_applications for insert with check (
  payment_id in (select id from payments_received where tenant_id in (select current_tenant_ids()))
);



-- ==========================================
-- File: 20260827204356_ar_posting_functions.sql
-- ==========================================
-- Session 4: AR posting functions.
--
-- Both are SECURITY DEFINER, deliberately unlike post_manual_journal_entry (Session 3).
-- Rationale (also in CONTEXT_LOG.md): a manual journal entry in CPA Mode is a direct
-- ledger action and correctly requires owner/admin/accountant per journal_entries' RLS.
-- Issuing an invoice or recording a payment is a normal Owner Mode business action —
-- per project.md's "complexity grows invisibly" principle, any active tenant member
-- who can create an invoice should be able to trigger its (correct, structurally
-- balanced) GL posting without also needing accountant-level ledger permissions.
-- Authorization is still enforced inside each function via an explicit membership
-- check; the security-definer privilege only bypasses journal_entries' *role*
-- restriction, not tenant isolation.

create or replace function public.post_invoice_issued(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
  v_ar_account_id uuid;
  v_revenue_account_id uuid;
  v_tax_account_id uuid;
  v_entry_id uuid;
begin
  select * into v_invoice from invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice % not found', p_invoice_id;
  end if;

  if not exists (
    select 1 from memberships
    where tenant_id = v_invoice.tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice % has already been issued (status=%)', p_invoice_id, v_invoice.status;
  end if;

  select id into v_ar_account_id from accounts where tenant_id = v_invoice.tenant_id and code = '1010';
  select id into v_revenue_account_id from accounts where tenant_id = v_invoice.tenant_id and code = '4000';
  select id into v_tax_account_id from accounts where tenant_id = v_invoice.tenant_id and code = '2010';

  if v_ar_account_id is null or v_revenue_account_id is null then
    raise exception 'tenant % is missing the standard AR/Revenue accounts (codes 1010/4000)', v_invoice.tenant_id;
  end if;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (v_invoice.tenant_id, v_invoice.issue_date, 'Invoice ' || v_invoice.invoice_number || ' issued', 'invoice', v_invoice.id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_ar_account_id, v_invoice.total, 0, 'Invoice ' || v_invoice.invoice_number);

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_revenue_account_id, 0, v_invoice.subtotal, 'Invoice ' || v_invoice.invoice_number);

  if v_invoice.tax_total > 0 then
    if v_tax_account_id is null then
      raise exception 'tenant % is missing the Sales Tax Payable account (code 2010)', v_invoice.tenant_id;
    end if;
    insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
    values (v_entry_id, v_tax_account_id, 0, v_invoice.tax_total, 'Sales tax on ' || v_invoice.invoice_number);
  end if;

  update invoices set status = 'sent', balance_due = total where id = p_invoice_id;

  return v_entry_id;
end;
$$;

grant execute on function public.post_invoice_issued(uuid) to authenticated;

-- Records a payment against one or more invoices, applies it, and posts the GL entry
-- in one transaction. Callable both by an authenticated member (manual "record payment")
-- and by the service-role client from the Stripe webhook handler (auth.uid() is null
-- there, so the membership check is skipped for service_role — the webhook route itself
-- is the auth boundary in that path, gated on Stripe's signature verification).
create or replace function public.post_payment_received(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_stripe_payment_intent_id text,
  p_applications jsonb -- [{ "invoiceId": uuid, "amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_cash_account_id uuid;
  v_ar_account_id uuid;
  v_entry_id uuid;
  v_app jsonb;
  v_total_applied numeric := 0;
  v_new_balance numeric;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if jsonb_array_length(p_applications) = 0 then
    raise exception 'a payment must be applied to at least one invoice';
  end if;

  select id into v_cash_account_id from accounts where tenant_id = p_tenant_id and code = '1000';
  select id into v_ar_account_id from accounts where tenant_id = p_tenant_id and code = '1010';

  if v_cash_account_id is null or v_ar_account_id is null then
    raise exception 'tenant % is missing the standard Cash/AR accounts (codes 1000/1010)', p_tenant_id;
  end if;

  insert into payments_received (tenant_id, contact_id, payment_date, amount, method, reference, stripe_payment_intent_id, created_by)
  values (p_tenant_id, p_contact_id, p_payment_date, p_amount, p_method, p_reference, p_stripe_payment_intent_id, auth.uid())
  returning id into v_payment_id;

  for v_app in select * from jsonb_array_elements(p_applications)
  loop
    insert into payment_applications (payment_id, invoice_id, amount_applied)
    values (v_payment_id, (v_app->>'invoiceId')::uuid, (v_app->>'amount')::numeric);

    v_total_applied := v_total_applied + (v_app->>'amount')::numeric;

    update invoices
    set balance_due = balance_due - (v_app->>'amount')::numeric,
        status = case
          when balance_due - (v_app->>'amount')::numeric <= 0 then 'paid'
          else 'partial'
        end
    where id = (v_app->>'invoiceId')::uuid and tenant_id = p_tenant_id
    returning balance_due into v_new_balance;

    if not found then
      raise exception 'invoice % does not belong to tenant %', (v_app->>'invoiceId')::uuid, p_tenant_id;
    end if;
    if v_new_balance < 0 then
      raise exception 'payment application overpays invoice % by %', (v_app->>'invoiceId')::uuid, -v_new_balance;
    end if;
  end loop;

  if round(v_total_applied, 2) <> round(p_amount, 2) then
    raise exception 'payment applications (%) must sum to the payment amount (%)', v_total_applied, p_amount;
  end if;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, p_payment_date, 'Payment received', 'payment_received', v_payment_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_cash_account_id, p_amount, 0);

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_ar_account_id, 0, p_amount);

  return v_payment_id;
end;
$$;

grant execute on function public.post_payment_received(uuid, uuid, date, numeric, text, text, text, jsonb) to authenticated;
grant execute on function public.post_payment_received(uuid, uuid, date, numeric, text, text, text, jsonb) to service_role;



-- ==========================================
-- File: 20260827204414_accounts_payable.sql
-- ==========================================
-- Session 5: Accounts Payable, mirroring Session 4's pattern.
--
-- Same documented deviation as invoices: bills.project_id has no FK yet (Projects
-- module unbuilt); bill_lines.item_id likewise (Inventory module unbuilt);
-- bills.source_document_id likewise (Documents module lands in Session 6).

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  vendor_id uuid not null references contacts(id),
  project_id uuid,
  bill_number text,
  issue_date date not null,
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'scheduled', 'partial', 'paid', 'void')),
  total numeric(14, 2) not null default 0,
  balance_due numeric(14, 2) not null default 0,
  source_document_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists bills_tenant_idx on bills (tenant_id);
create index if not exists bills_vendor_idx on bills (vendor_id);
create index if not exists bills_tenant_status_idx on bills (tenant_id, status);

create table if not exists bill_lines (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  account_id uuid references accounts(id),
  item_id uuid,
  description text,
  quantity numeric(12, 2) default 1,
  unit_cost numeric(14, 2),
  amount numeric(14, 2) not null,
  sort_order int not null default 0
);

create index if not exists bill_lines_bill_idx on bill_lines (bill_id);

create table if not exists payments_made (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  vendor_id uuid not null references contacts(id),
  payment_date date not null,
  amount numeric(14, 2) not null,
  method text,
  scheduled_for date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists payments_made_tenant_idx on payments_made (tenant_id);
create index if not exists payments_made_vendor_idx on payments_made (vendor_id);

create table if not exists bill_payment_applications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments_made(id) on delete cascade,
  bill_id uuid not null references bills(id),
  amount_applied numeric(14, 2) not null
);

create index if not exists bill_payment_applications_payment_idx on bill_payment_applications (payment_id);
create index if not exists bill_payment_applications_bill_idx on bill_payment_applications (bill_id);

-- RLS
alter table bills enable row level security;
alter table bill_lines enable row level security;
alter table payments_made enable row level security;
alter table bill_payment_applications enable row level security;

drop policy if exists "bills_select" on bills;
create policy "bills_select" on bills for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "bills_insert" on bills;
create policy "bills_insert" on bills for insert with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "bills_update" on bills;
create policy "bills_update" on bills for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
drop policy if exists "bills_delete" on bills;
create policy "bills_delete" on bills for delete using (tenant_id in (select current_admin_tenant_ids()) and status = 'open' and balance_due = total);

drop policy if exists "bill_lines_select" on bill_lines;
create policy "bill_lines_select" on bill_lines for select using (
  bill_id in (select id from bills where tenant_id in (select current_tenant_ids()))
);
drop policy if exists "bill_lines_insert" on bill_lines;
create policy "bill_lines_insert" on bill_lines for insert with check (
  bill_id in (select id from bills where tenant_id in (select current_tenant_ids()))
);
drop policy if exists "bill_lines_delete" on bill_lines;
create policy "bill_lines_delete" on bill_lines for delete using (
  bill_id in (select id from bills where tenant_id in (select current_tenant_ids()))
);

drop policy if exists "payments_made_select" on payments_made;
create policy "payments_made_select" on payments_made for select using (tenant_id in (select current_tenant_ids()));
drop policy if exists "payments_made_insert" on payments_made;
create policy "payments_made_insert" on payments_made for insert with check (tenant_id in (select current_tenant_ids()));

drop policy if exists "bill_payment_applications_select" on bill_payment_applications;
create policy "bill_payment_applications_select" on bill_payment_applications for select using (
  payment_id in (select id from payments_made where tenant_id in (select current_tenant_ids()))
);
drop policy if exists "bill_payment_applications_insert" on bill_payment_applications;
create policy "bill_payment_applications_insert" on bill_payment_applications for insert with check (
  payment_id in (select id from payments_made where tenant_id in (select current_tenant_ids()))
);



-- ==========================================
-- File: 20260827204449_ap_posting_functions.sql
-- ==========================================
-- Session 5: AP posting functions. Both SECURITY DEFINER — same rationale as the
-- Session 4 AR posting functions (see that migration's header comment).
--
-- Unlike invoices (which start 'draft' and post on send), bills' own status enum
-- has no 'draft' state — a vendor bill is a real liability the moment it's recorded,
-- so create_bill_received creates the bill, its lines, and the GL entry atomically
-- in one call rather than a separate create-then-post step.

create or replace function public.create_bill_received(
  p_tenant_id uuid,
  p_vendor_id uuid,
  p_bill_number text,
  p_issue_date date,
  p_due_date date,
  p_lines jsonb -- [{ "accountId": uuid, "description": text, "quantity": numeric, "unitCost": numeric, "amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill_id uuid;
  v_ap_account_id uuid;
  v_entry_id uuid;
  v_line jsonb;
  v_total numeric := 0;
  v_sort int := 0;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'a bill needs at least one line';
  end if;

  select id into v_ap_account_id from accounts where tenant_id = p_tenant_id and code = '2000';
  if v_ap_account_id is null then
    raise exception 'tenant % is missing the standard Accounts Payable account (code 2000)', p_tenant_id;
  end if;

  insert into bills (tenant_id, vendor_id, bill_number, issue_date, due_date, status, created_by)
  values (p_tenant_id, p_vendor_id, p_bill_number, p_issue_date, p_due_date, 'open', auth.uid())
  returning id into v_bill_id;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, p_issue_date, 'Bill ' || coalesce(p_bill_number, v_bill_id::text) || ' received', 'bill', v_bill_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into bill_lines (bill_id, account_id, description, quantity, unit_cost, amount, sort_order)
    values (
      v_bill_id,
      (v_line->>'accountId')::uuid,
      v_line->>'description',
      coalesce((v_line->>'quantity')::numeric, 1),
      (v_line->>'unitCost')::numeric,
      (v_line->>'amount')::numeric,
      v_sort
    );

    insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
    values (v_entry_id, (v_line->>'accountId')::uuid, (v_line->>'amount')::numeric, 0, v_line->>'description');

    v_total := v_total + (v_line->>'amount')::numeric;
    v_sort := v_sort + 1;
  end loop;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_ap_account_id, 0, v_total, 'Bill ' || coalesce(p_bill_number, v_bill_id::text));

  update bills set total = v_total, balance_due = v_total where id = v_bill_id;

  return v_bill_id;
end;
$$;

grant execute on function public.create_bill_received(uuid, uuid, text, date, date, jsonb) to authenticated;

-- Records (and, unless scheduled for a future date, immediately posts) a vendor
-- payment against one or more bills. Mirrors post_payment_received.
create or replace function public.post_vendor_payment_made(
  p_tenant_id uuid,
  p_vendor_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_scheduled_for date,
  p_applications jsonb -- [{ "billId": uuid, "amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_app jsonb;
  v_is_future_scheduled boolean;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  v_is_future_scheduled := p_scheduled_for is not null and p_scheduled_for > current_date;

  insert into payments_made (tenant_id, vendor_id, payment_date, amount, method, scheduled_for, created_by)
  values (p_tenant_id, p_vendor_id, p_payment_date, p_amount, p_method, p_scheduled_for, auth.uid())
  returning id into v_payment_id;

  if v_is_future_scheduled then
    -- Scheduled for a future date: record the intent only. bill_payment_applications
    -- and the GL entry are created later by execute_scheduled_vendor_payment, either
    -- on the scheduled date or via a manual "process now" trigger.
    for v_app in select * from jsonb_array_elements(p_applications)
    loop
      update bills set status = 'scheduled' where id = (v_app->>'billId')::uuid and tenant_id = p_tenant_id;
    end loop;
    return v_payment_id;
  end if;

  perform public._apply_vendor_payment(v_payment_id, p_tenant_id, p_amount, p_applications);
  return v_payment_id;
end;
$$;

-- Shared application + GL-posting logic, used by both the immediate path above and
-- execute_scheduled_vendor_payment below. Not exposed to authenticated directly —
-- callers must go through one of those two entry points, which own the authorization
-- and scheduling checks.
create or replace function public._apply_vendor_payment(
  p_payment_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_applications jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ap_account_id uuid;
  v_cash_account_id uuid;
  v_entry_id uuid;
  v_app jsonb;
  v_total_applied numeric := 0;
  v_new_balance numeric;
begin
  if jsonb_array_length(p_applications) = 0 then
    raise exception 'a payment must be applied to at least one bill';
  end if;

  select id into v_ap_account_id from accounts where tenant_id = p_tenant_id and code = '2000';
  select id into v_cash_account_id from accounts where tenant_id = p_tenant_id and code = '1000';
  if v_ap_account_id is null or v_cash_account_id is null then
    raise exception 'tenant % is missing the standard AP/Cash accounts (codes 2000/1000)', p_tenant_id;
  end if;

  for v_app in select * from jsonb_array_elements(p_applications)
  loop
    insert into bill_payment_applications (payment_id, bill_id, amount_applied)
    values (p_payment_id, (v_app->>'billId')::uuid, (v_app->>'amount')::numeric);

    v_total_applied := v_total_applied + (v_app->>'amount')::numeric;

    update bills
    set balance_due = balance_due - (v_app->>'amount')::numeric,
        status = case
          when balance_due - (v_app->>'amount')::numeric <= 0 then 'paid'
          else 'partial'
        end
    where id = (v_app->>'billId')::uuid and tenant_id = p_tenant_id
    returning balance_due into v_new_balance;

    if not found then
      raise exception 'bill % does not belong to tenant %', (v_app->>'billId')::uuid, p_tenant_id;
    end if;
    if v_new_balance < 0 then
      raise exception 'payment application overpays bill % by %', (v_app->>'billId')::uuid, -v_new_balance;
    end if;
  end loop;

  if round(v_total_applied, 2) <> round(p_amount, 2) then
    raise exception 'payment applications (%) must sum to the payment amount (%)', v_total_applied, p_amount;
  end if;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, current_date, 'Vendor payment made', 'payment_made', p_payment_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_ap_account_id, p_amount, 0);

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_cash_account_id, 0, p_amount);
end;
$$;

-- Manual (or, later, pg_cron-triggered) execution of a previously-scheduled payment.
create or replace function public.execute_scheduled_vendor_payment(
  p_payment_id uuid,
  p_applications jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments_made%rowtype;
begin
  select * into v_payment from payments_made where id = p_payment_id;
  if not found then
    raise exception 'payment % not found', p_payment_id;
  end if;

  if not exists (
    select 1 from memberships
    where tenant_id = v_payment.tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if exists (select 1 from bill_payment_applications where payment_id = p_payment_id) then
    raise exception 'payment % has already been executed', p_payment_id;
  end if;

  perform public._apply_vendor_payment(p_payment_id, v_payment.tenant_id, v_payment.amount, p_applications);
end;
$$;

grant execute on function public.post_vendor_payment_made(uuid, uuid, date, numeric, text, date, jsonb) to authenticated;
grant execute on function public.execute_scheduled_vendor_payment(uuid, jsonb) to authenticated;
revoke execute on function public._apply_vendor_payment(uuid, uuid, numeric, jsonb) from public, anon, authenticated;



-- ==========================================
-- File: 20260827204520_ar_ap_lockdown_function_grants.sql
-- ==========================================
-- Same gap Session 2 hit and fixed (auth_foundation_lockdown_function_grants):
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, so every SECURITY DEFINER
-- function from the AR/AP posting-functions migrations was callable by the `anon`
-- role. Each function's own auth.uid()/auth.role() check already rejects an
-- unauthenticated caller functionally, but revoking at the grant level is the
-- established defense-in-depth pattern here — don't rely solely on the function
-- body when the fix is one line.

revoke execute on function public.post_invoice_issued(uuid) from public, anon;
revoke execute on function public.post_payment_received(uuid, uuid, date, numeric, text, text, text, jsonb) from public, anon;
revoke execute on function public.create_bill_received(uuid, uuid, text, date, date, jsonb) from public, anon;
revoke execute on function public.post_vendor_payment_made(uuid, uuid, date, numeric, text, date, jsonb) from public, anon;
revoke execute on function public.execute_scheduled_vendor_payment(uuid, jsonb) from public, anon;



-- ==========================================
-- File: 20260828000001_documents_expenses_agent_actions.sql
-- ==========================================
-- Session 6: Documents, Expenses, and Agentic Backbone (agent_actions)

-- 1. Documents Table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  uploaded_by uuid references auth.users(id),
  storage_path text not null,
  doc_type text check (doc_type in ('receipt','bill','bank_statement','other')) default 'receipt',
  status text not null default 'pending' check (status in ('pending','processing','extracted','verified','posted','rejected')),
  ocr_confidence numeric(4,3),
  extracted_data jsonb default '{}'::jsonb,
  linked_bill_id uuid references public.bills(id),
  linked_expense_id uuid, -- added constraint below after expenses table creation
  created_at timestamptz not null default now()
);

-- RLS for Documents
alter table public.documents enable row level security;

drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (tenant_id in (select public.current_tenant_ids()));


-- 2. Expenses Table
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid references public.contacts(id),
  expense_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid not null references public.accounts(id),
  project_id uuid, -- placeholder for future projects module
  receipt_document_id uuid references public.documents(id),
  status text not null default 'draft' check (status in ('draft','verified','posted')),
  payment_method text default 'cash',
  memo text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Add foreign key back to documents.linked_expense_id
do $$
begin
  alter table public.documents
  add constraint documents_linked_expense_id_fkey
  foreign key (linked_expense_id) references public.expenses(id) on delete set null;
exception when duplicate_object then null;
when duplicate_table then null;
end $$;;

-- RLS for Expenses
alter table public.expenses enable row level security;

drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses
  for select using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "expenses_insert" on public.expenses;
create policy "expenses_insert" on public.expenses
  for insert with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "expenses_update" on public.expenses;
create policy "expenses_update" on public.expenses
  for update using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "expenses_delete" on public.expenses;
create policy "expenses_delete" on public.expenses
  for delete using (tenant_id in (select public.current_tenant_ids()));


-- 3. Agent Actions Table (Audit & Autonomous Operations Log)
create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_name text not null, -- e.g. 'ap_bookkeeping_agent', 'reconciliation_agent'
  module text not null, -- e.g. 'documents', 'banking', 'ar', 'ap'
  trigger_event text not null, -- e.g. 'document.uploaded', 'bank_transaction.created'
  input_context jsonb not null default '{}'::jsonb,
  proposed_action jsonb not null default '{}'::jsonb,
  confidence_score numeric(4,3),
  autonomy_level int not null check (autonomy_level between 0 and 3),
  status text not null default 'proposed' check (status in ('proposed','auto_executed','approved','rejected','reversed')),
  executed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  reversal_of_id uuid references public.agent_actions(id),
  created_at timestamptz not null default now()
);

-- RLS for Agent Actions
alter table public.agent_actions enable row level security;

drop policy if exists "agent_actions_select" on public.agent_actions;
create policy "agent_actions_select" on public.agent_actions
  for select using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "agent_actions_insert" on public.agent_actions;
create policy "agent_actions_insert" on public.agent_actions
  for insert with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "agent_actions_update" on public.agent_actions;
create policy "agent_actions_update" on public.agent_actions
  for update using (tenant_id in (select public.current_tenant_ids()));


-- 4. Storage Bucket Setup for Receipts
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload receipts" on storage.objects;
create policy "Authenticated users can upload receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts');

drop policy if exists "Authenticated users can view receipts" on storage.objects;
create policy "Authenticated users can view receipts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts');



-- ==========================================
-- File: 20260828000002_expense_posting_functions.sql
-- ==========================================
-- Session 6: Expense Posting RPC Functions & Security Lockdown

-- Creates and posts a non-bill expense directly into the double-entry GL
create or replace function public.post_expense_created(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_expense_date date,
  p_amount numeric,
  p_account_id uuid, -- Category/Expense account
  p_payment_method text,
  p_memo text,
  p_document_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_cash_account_id uuid;
  v_entry_id uuid;
begin
  -- Enforce tenant membership
  if not exists (
    select 1 from public.memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  -- Cash / Bank default account (Code 1000)
  select id into v_cash_account_id from public.accounts where tenant_id = p_tenant_id and code = '1000';
  if v_cash_account_id is null then
    raise exception 'tenant % is missing standard Cash account (code 1000)', p_tenant_id;
  end if;

  -- Insert Expense row
  insert into public.expenses (
    tenant_id, contact_id, expense_date, amount, account_id,
    receipt_document_id, status, payment_method, memo, created_by
  ) values (
    p_tenant_id, p_contact_id, p_expense_date, p_amount, p_account_id,
    p_document_id, 'posted', coalesce(p_payment_method, 'cash'), p_memo, auth.uid()
  ) returning id into v_expense_id;

  -- Create Journal Entry (GL)
  insert into public.journal_entries (
    tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by
  ) values (
    p_tenant_id, p_expense_date, coalesce(p_memo, 'Expense payment'), 'expense', v_expense_id, 'posted', now(), auth.uid()
  ) returning id into v_entry_id;

  -- Debit Expense Category Account
  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, p_account_id, p_amount, 0, p_memo);

  -- Credit Cash / Bank Account
  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_cash_account_id, 0, p_amount, 'Cash Outflow');

  -- Link back to document if provided
  if p_document_id is not null then
    update public.documents
    set linked_expense_id = v_expense_id, status = 'posted'
    where id = p_document_id and tenant_id = p_tenant_id;
  end if;

  return v_expense_id;
end;
$$;

-- Grant execution to authenticated users, revoke from public and anon
grant execute on function public.post_expense_created(uuid, uuid, date, numeric, uuid, text, text, uuid) to authenticated;
revoke execute on function public.post_expense_created(uuid, uuid, date, numeric, uuid, text, text, uuid) from public, anon;



-- ==========================================
-- File: 20260828000003_banking_and_reconciliation.sql
-- ==========================================
-- Session 7: Banking & Rule-Based Reconciliation Schema

-- 1. Bank Accounts Table
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  institution_name text default 'Plaid Sandbox Bank',
  account_type text default 'checking',
  current_balance numeric(14,2) default 0.00,
  plaid_item_id text,
  plaid_account_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS for bank_accounts
alter table public.bank_accounts enable row level security;

drop policy if exists "bank_accounts_select" on public.bank_accounts;
create policy "bank_accounts_select" on public.bank_accounts
  for select using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "bank_accounts_insert" on public.bank_accounts;
create policy "bank_accounts_insert" on public.bank_accounts
  for insert with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "bank_accounts_update" on public.bank_accounts;
create policy "bank_accounts_update" on public.bank_accounts
  for update using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "bank_accounts_delete" on public.bank_accounts;
create policy "bank_accounts_delete" on public.bank_accounts
  for delete using (tenant_id in (select public.current_tenant_ids()));


-- 2. Bank Transactions Table
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  plaid_transaction_id text unique,
  posted_date date not null,
  amount numeric(14,2) not null, -- positive = credit/money in, negative = debit/money out
  description text not null,
  status text not null default 'unmatched' check (status in ('unmatched','matched','excluded')),
  created_at timestamptz not null default now()
);

-- RLS for bank_transactions
alter table public.bank_transactions enable row level security;

drop policy if exists "bank_transactions_select" on public.bank_transactions;
create policy "bank_transactions_select" on public.bank_transactions
  for select using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "bank_transactions_insert" on public.bank_transactions;
create policy "bank_transactions_insert" on public.bank_transactions
  for insert with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "bank_transactions_update" on public.bank_transactions;
create policy "bank_transactions_update" on public.bank_transactions
  for update using (tenant_id in (select public.current_tenant_ids()));


-- 3. Reconciliation Matches Table
create table if not exists public.reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  matched_type text not null check (matched_type in ('invoice_payment','bill_payment','journal_entry','expense','transfer','manual')),
  matched_id uuid, -- polymorphic FK to invoice_id, bill_id, journal_entry_id, or expense_id
  confidence_score numeric(4,3) default 0.850,
  match_signals jsonb default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','auto_matched','needs_review','approved','rejected')),
  created_by_agent boolean not null default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS for reconciliation_matches
alter table public.reconciliation_matches enable row level security;

drop policy if exists "reconciliation_matches_select" on public.reconciliation_matches;
create policy "reconciliation_matches_select" on public.reconciliation_matches
  for select using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "reconciliation_matches_insert" on public.reconciliation_matches;
create policy "reconciliation_matches_insert" on public.reconciliation_matches
  for insert with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "reconciliation_matches_update" on public.reconciliation_matches;
create policy "reconciliation_matches_update" on public.reconciliation_matches
  for update using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "reconciliation_matches_delete" on public.reconciliation_matches;
create policy "reconciliation_matches_delete" on public.reconciliation_matches
  for delete using (tenant_id in (select public.current_tenant_ids()));



-- ==========================================
-- File: 20260828000004_reports_and_unified_ledger_feed.sql
-- ==========================================
-- Session 8: Unified Transactions Feed & Reporting Helpers

-- Create or replace unified view for all transactions (invoices, bills, expenses, payments)
create or replace view public.unified_transactions_feed as
select
  'invoice' as transaction_type,
  i.id as id,
  i.tenant_id as tenant_id,
  c.display_name as party_name,
  i.total as amount,
  i.issue_date as transaction_date,
  i.status as status,
  'Invoice #' || i.invoice_number as description,
  i.created_at as created_at
from public.invoices i
left join public.contacts c on c.id = i.customer_id

union all

select
  'bill' as transaction_type,
  b.id as id,
  b.tenant_id as tenant_id,
  c.display_name as party_name,
  -b.total as amount, -- negative for money out
  b.issue_date as transaction_date,
  b.status as status,
  'Bill #' || b.bill_number as description,
  b.created_at as created_at
from public.bills b
left join public.contacts c on c.id = b.vendor_id

union all

select
  'expense' as transaction_type,
  e.id as id,
  e.tenant_id as tenant_id,
  c.display_name as party_name,
  -e.amount as amount, -- negative for money out
  e.expense_date as transaction_date,
  e.status as status,
  coalesce(e.memo, 'Receipt Expense') as description,
  e.created_at as created_at
from public.expenses e
left join public.contacts c on c.id = e.contact_id

union all

select
  'payment_received' as transaction_type,
  pr.id as id,
  pr.tenant_id as tenant_id,
  c.display_name as party_name,
  pr.amount as amount, -- positive for money in
  pr.payment_date as transaction_date,
  'posted' as status,
  'Customer Payment Received (' || pr.method || ')' as description,
  pr.created_at as created_at
from public.payments_received pr
left join public.contacts c on c.id = pr.customer_id

union all

select
  'payment_made' as transaction_type,
  pm.id as id,
  pm.tenant_id as tenant_id,
  c.display_name as party_name,
  -pm.amount as amount, -- negative for money out
  pm.payment_date as transaction_date,
  'posted' as status,
  'Vendor Payment Made (' || pm.method || ')' as description,
  pm.created_at as created_at
from public.payments_made pm
left join public.contacts c on c.id = pm.vendor_id;

-- Grant select to authenticated users on view
grant select on public.unified_transactions_feed to authenticated;



-- ==========================================
-- File: 20260828000005_reconciliation_agent_and_vector_embeddings.sql
-- ==========================================
-- Session 9: Reconciliation Agent (Agentic Layer v1) & Vector Embeddings

-- Enable vector extension for semantic matching
create extension if not exists vector;

-- Vector memory table for RAG-grounded categorization/matching
create table if not exists public.transaction_embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_type text not null, -- 'bank_transaction', 'contact', 'invoice', 'bill', 'expense'
  source_id uuid not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- HNSW Cosine Distance index for fast similarity search
create index if not exists transaction_embeddings_hnsw_idx 
on public.transaction_embeddings using hnsw (embedding vector_cosine_ops);

-- RLS policies for transaction_embeddings
alter table public.transaction_embeddings enable row level security;

drop policy if exists "Tenant members can view transaction embeddings" on public.transaction_embeddings;
create policy "Tenant members can view transaction embeddings"
on public.transaction_embeddings for select
using (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

drop policy if exists "Tenant members can insert transaction embeddings" on public.transaction_embeddings;
create policy "Tenant members can insert transaction embeddings"
on public.transaction_embeddings for insert
with check (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

-- Add settings column to tenants table if missing
alter table public.tenants add column if not exists settings jsonb default '{"auto_match_threshold": 0.95}'::jsonb;



-- ==========================================
-- File: 20260828000006_ap_bookkeeping_agent_and_vendor_rules.sql
-- ==========================================
-- Session 10: AP Bookkeeping Agent (Agentic Layer v2) & Vendor Learning Rules

-- Vendor memory / rules table for categorizing receipts & bills
create table if not exists public.vendor_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_name text not null,
  default_account_id uuid references public.accounts(id) on delete set null,
  default_tax_rate numeric(5,2) default 0.00,
  learned_from_action_id uuid references public.agent_actions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, vendor_name)
);

-- Enable RLS for vendor_rules
alter table public.vendor_rules enable row level security;

drop policy if exists "Tenant members can view vendor rules" on public.vendor_rules;
create policy "Tenant members can view vendor rules"
on public.vendor_rules for select
using (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

drop policy if exists "Tenant members can insert/update vendor rules" on public.vendor_rules;
create policy "Tenant members can insert/update vendor rules"
on public.vendor_rules for all
using (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

-- Add duplicate_detected and line_items columns to documents table
alter table public.documents add column if not exists duplicate_detected boolean default false;
alter table public.documents add column if not exists line_items jsonb default '[]'::jsonb;



-- ==========================================
-- File: 20260828000007_ar_collections_agent_and_dunning.sql
-- ==========================================
-- Session 11: AR Collections Agent (Agentic Layer v3) & Dunning Schedules

-- Dunning schedule tracking table for automated AR collection workflows
create table if not exists public.dunning_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  customer_id uuid not null references public.contacts(id) on delete cascade,
  step text not null, -- 'friendly_reminder', 'firm_followup', 'urgent_notice', 'final_demand'
  scheduled_for date not null,
  status text not null default 'scheduled', -- 'scheduled', 'sent', 'cancelled', 'paid'
  sent_at timestamptz,
  template_used text,
  stripe_payment_url text,
  created_at timestamptz not null default now()
);

-- Enable RLS for dunning_schedules
alter table public.dunning_schedules enable row level security;

drop policy if exists "Tenant members can view dunning schedules" on public.dunning_schedules;
create policy "Tenant members can view dunning schedules"
on public.dunning_schedules for select
using (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

drop policy if exists "Tenant members can manage dunning schedules" on public.dunning_schedules;
create policy "Tenant members can manage dunning schedules"
on public.dunning_schedules for all
using (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

-- Add customer risk metrics to contacts table
alter table public.contacts add column if not exists risk_score numeric(5,2) default 0.00;
alter table public.contacts add column if not exists avg_days_to_pay integer default 0;



-- ==========================================
-- File: 20260828000008_agent_control_plane_and_hardening.sql
-- ==========================================
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



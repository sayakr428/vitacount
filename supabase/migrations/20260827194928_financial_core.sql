-- Session 3: Financial Core — Chart of Accounts, dimensions, periods, GL

create table accounts (
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

create table dimension_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  is_active boolean not null default true
);

create table dimension_values (
  id uuid primary key default gen_random_uuid(),
  dimension_type_id uuid not null references dimension_types(id),
  tenant_id uuid not null references tenants(id),
  value text not null,
  is_active boolean not null default true
);

create table periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','closed','locked')),
  unique (tenant_id, start_date, end_date)
);

create table journal_entries (
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

create table journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references accounts(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  memo text,
  check (debit >= 0 and credit >= 0 and not (debit > 0 and credit > 0))
);

create table journal_entry_line_dimensions (
  journal_entry_line_id uuid not null references journal_entry_lines(id) on delete cascade,
  dimension_value_id uuid not null references dimension_values(id),
  primary key (journal_entry_line_id, dimension_value_id)
);

create index accounts_tenant_idx on accounts (tenant_id);
create index journal_entries_tenant_date_idx on journal_entries (tenant_id, entry_date);
create index journal_entry_lines_entry_idx on journal_entry_lines (journal_entry_id);
create index journal_entry_lines_account_idx on journal_entry_lines (account_id);
create index journal_entry_lines_tenant_account_idx on journal_entry_lines (journal_entry_id, account_id);

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

create policy "accounts_select" on accounts for select using (tenant_id in (select current_tenant_ids()));
create policy "accounts_insert" on accounts for insert with check (tenant_id in (select current_tenant_ids()));
create policy "accounts_update" on accounts for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
create policy "accounts_delete" on accounts for delete using (tenant_id in (select current_admin_tenant_ids()));

create policy "dimension_types_select" on dimension_types for select using (tenant_id in (select current_tenant_ids()));
create policy "dimension_types_write" on dimension_types for insert with check (tenant_id in (select current_tenant_ids()));
create policy "dimension_types_update" on dimension_types for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
create policy "dimension_types_delete" on dimension_types for delete using (tenant_id in (select current_admin_tenant_ids()));

create policy "dimension_values_select" on dimension_values for select using (tenant_id in (select current_tenant_ids()));
create policy "dimension_values_write" on dimension_values for insert with check (tenant_id in (select current_tenant_ids()));
create policy "dimension_values_update" on dimension_values for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
create policy "dimension_values_delete" on dimension_values for delete using (tenant_id in (select current_admin_tenant_ids()));

create policy "periods_select" on periods for select using (tenant_id in (select current_tenant_ids()));
create policy "periods_write" on periods for insert with check (tenant_id in (select current_admin_tenant_ids()));
create policy "periods_update" on periods for update using (tenant_id in (select current_admin_tenant_ids())) with check (tenant_id in (select current_admin_tenant_ids()));

create policy "journal_entries_select" on journal_entries for select using (tenant_id in (select current_tenant_ids()));
create policy "only_accountant_plus_can_post_journal_entries" on journal_entries
  for insert with check (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid() and status = 'active' and role in ('owner','admin','accountant')
    )
  );
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

create policy "journal_entry_lines_select" on journal_entry_lines
  for select using (
    journal_entry_id in (select id from journal_entries where tenant_id in (select current_tenant_ids()))
  );
create policy "journal_entry_lines_insert" on journal_entry_lines
  for insert with check (
    journal_entry_id in (
      select je.id from journal_entries je
      join memberships m on m.tenant_id = je.tenant_id
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','accountant')
    )
  );
create policy "journal_entry_lines_delete" on journal_entry_lines
  for delete using (
    journal_entry_id in (
      select je.id from journal_entries je
      join memberships m on m.tenant_id = je.tenant_id
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','accountant')
    )
  );

create policy "journal_entry_line_dimensions_select" on journal_entry_line_dimensions
  for select using (
    journal_entry_line_id in (
      select jel.id from journal_entry_lines jel
      join journal_entries je on je.id = jel.journal_entry_id
      where je.tenant_id in (select current_tenant_ids())
    )
  );
create policy "journal_entry_line_dimensions_insert" on journal_entry_line_dimensions
  for insert with check (
    journal_entry_line_id in (
      select jel.id from journal_entry_lines jel
      join journal_entries je on je.id = jel.journal_entry_id
      join memberships m on m.tenant_id = je.tenant_id
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','accountant')
    )
  );

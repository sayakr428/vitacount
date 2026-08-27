-- Session 5: Accounts Payable, mirroring Session 4's pattern.
--
-- Same documented deviation as invoices: bills.project_id has no FK yet (Projects
-- module unbuilt); bill_lines.item_id likewise (Inventory module unbuilt);
-- bills.source_document_id likewise (Documents module lands in Session 6).

create table bills (
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

create index bills_tenant_idx on bills (tenant_id);
create index bills_vendor_idx on bills (vendor_id);
create index bills_tenant_status_idx on bills (tenant_id, status);

create table bill_lines (
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

create index bill_lines_bill_idx on bill_lines (bill_id);

create table payments_made (
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

create index payments_made_tenant_idx on payments_made (tenant_id);
create index payments_made_vendor_idx on payments_made (vendor_id);

create table bill_payment_applications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments_made(id) on delete cascade,
  bill_id uuid not null references bills(id),
  amount_applied numeric(14, 2) not null
);

create index bill_payment_applications_payment_idx on bill_payment_applications (payment_id);
create index bill_payment_applications_bill_idx on bill_payment_applications (bill_id);

-- RLS
alter table bills enable row level security;
alter table bill_lines enable row level security;
alter table payments_made enable row level security;
alter table bill_payment_applications enable row level security;

create policy "bills_select" on bills for select using (tenant_id in (select current_tenant_ids()));
create policy "bills_insert" on bills for insert with check (tenant_id in (select current_tenant_ids()));
create policy "bills_update" on bills for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
create policy "bills_delete" on bills for delete using (tenant_id in (select current_admin_tenant_ids()) and status = 'open' and balance_due = total);

create policy "bill_lines_select" on bill_lines for select using (
  bill_id in (select id from bills where tenant_id in (select current_tenant_ids()))
);
create policy "bill_lines_insert" on bill_lines for insert with check (
  bill_id in (select id from bills where tenant_id in (select current_tenant_ids()))
);
create policy "bill_lines_delete" on bill_lines for delete using (
  bill_id in (select id from bills where tenant_id in (select current_tenant_ids()))
);

create policy "payments_made_select" on payments_made for select using (tenant_id in (select current_tenant_ids()));
create policy "payments_made_insert" on payments_made for insert with check (tenant_id in (select current_tenant_ids()));

create policy "bill_payment_applications_select" on bill_payment_applications for select using (
  payment_id in (select id from payments_made where tenant_id in (select current_tenant_ids()))
);
create policy "bill_payment_applications_insert" on bill_payment_applications for insert with check (
  payment_id in (select id from payments_made where tenant_id in (select current_tenant_ids()))
);

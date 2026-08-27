-- Session 4: Contacts + Accounts Receivable
--
-- Schema deviations from project.md Part 2.3/2.4, both documented in CONTEXT_LOG.md:
--   - invoices.project_id / invoice_lines.item_id are plain nullable uuid columns with
--     NO foreign key yet, since the Projects and Inventory modules (which own the
--     `projects`/`items` tables) aren't built. The FK gets added in the migration that
--     creates those tables.
--   - tenants.default_tax_rate is a new column: the flat-rate placeholder tax calc the
--     playbook calls for (TaxJar/Avalara integration is explicitly deferred post-MVP).

alter table tenants add column default_tax_rate numeric(6,4) not null default 0;

create table contacts (
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

create index contacts_tenant_idx on contacts (tenant_id);

create table invoices (
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

create index invoices_tenant_idx on invoices (tenant_id);
create index invoices_contact_idx on invoices (contact_id);
create index invoices_tenant_status_idx on invoices (tenant_id, status);

create table invoice_lines (
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

create index invoice_lines_invoice_idx on invoice_lines (invoice_id);

create table payments_received (
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

create index payments_received_tenant_idx on payments_received (tenant_id);
create index payments_received_contact_idx on payments_received (contact_id);

create table payment_applications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments_received(id) on delete cascade,
  invoice_id uuid not null references invoices(id),
  amount_applied numeric(14, 2) not null
);

create index payment_applications_payment_idx on payment_applications (payment_id);
create index payment_applications_invoice_idx on payment_applications (invoice_id);

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

create policy "contacts_select" on contacts for select using (tenant_id in (select current_tenant_ids()));
create policy "contacts_insert" on contacts for insert with check (tenant_id in (select current_tenant_ids()));
create policy "contacts_update" on contacts for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
create policy "contacts_delete" on contacts for delete using (tenant_id in (select current_admin_tenant_ids()));

create policy "invoices_select" on invoices for select using (tenant_id in (select current_tenant_ids()));
create policy "invoices_insert" on invoices for insert with check (tenant_id in (select current_tenant_ids()));
create policy "invoices_update" on invoices for update using (tenant_id in (select current_tenant_ids())) with check (tenant_id in (select current_tenant_ids()));
create policy "invoices_delete" on invoices for delete using (tenant_id in (select current_admin_tenant_ids()) and status = 'draft');

create policy "invoice_lines_select" on invoice_lines for select using (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
);
create policy "invoice_lines_insert" on invoice_lines for insert with check (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
);
create policy "invoice_lines_update" on invoice_lines for update using (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
) with check (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
);
create policy "invoice_lines_delete" on invoice_lines for delete using (
  invoice_id in (select id from invoices where tenant_id in (select current_tenant_ids()))
);

create policy "payments_received_select" on payments_received for select using (tenant_id in (select current_tenant_ids()));
create policy "payments_received_insert" on payments_received for insert with check (tenant_id in (select current_tenant_ids()));

create policy "payment_applications_select" on payment_applications for select using (
  payment_id in (select id from payments_received where tenant_id in (select current_tenant_ids()))
);
create policy "payment_applications_insert" on payment_applications for insert with check (
  payment_id in (select id from payments_received where tenant_id in (select current_tenant_ids()))
);

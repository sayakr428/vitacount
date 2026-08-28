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

create policy "bank_accounts_select" on public.bank_accounts
  for select using (tenant_id in (select public.current_tenant_ids()));

create policy "bank_accounts_insert" on public.bank_accounts
  for insert with check (tenant_id in (select public.current_tenant_ids()));

create policy "bank_accounts_update" on public.bank_accounts
  for update using (tenant_id in (select public.current_tenant_ids()));

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

create policy "bank_transactions_select" on public.bank_transactions
  for select using (tenant_id in (select public.current_tenant_ids()));

create policy "bank_transactions_insert" on public.bank_transactions
  for insert with check (tenant_id in (select public.current_tenant_ids()));

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

create policy "reconciliation_matches_select" on public.reconciliation_matches
  for select using (tenant_id in (select public.current_tenant_ids()));

create policy "reconciliation_matches_insert" on public.reconciliation_matches
  for insert with check (tenant_id in (select public.current_tenant_ids()));

create policy "reconciliation_matches_update" on public.reconciliation_matches
  for update using (tenant_id in (select public.current_tenant_ids()));

create policy "reconciliation_matches_delete" on public.reconciliation_matches
  for delete using (tenant_id in (select public.current_tenant_ids()));

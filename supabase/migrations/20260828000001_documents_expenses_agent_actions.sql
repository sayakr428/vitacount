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

create policy "documents_select" on public.documents
  for select using (tenant_id in (select public.current_tenant_ids()));

create policy "documents_insert" on public.documents
  for insert with check (tenant_id in (select public.current_tenant_ids()));

create policy "documents_update" on public.documents
  for update using (tenant_id in (select public.current_tenant_ids()));

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
alter table public.documents
  add constraint documents_linked_expense_id_fkey
  foreign key (linked_expense_id) references public.expenses(id) on delete set null;

-- RLS for Expenses
alter table public.expenses enable row level security;

create policy "expenses_select" on public.expenses
  for select using (tenant_id in (select public.current_tenant_ids()));

create policy "expenses_insert" on public.expenses
  for insert with check (tenant_id in (select public.current_tenant_ids()));

create policy "expenses_update" on public.expenses
  for update using (tenant_id in (select public.current_tenant_ids()));

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

create policy "agent_actions_select" on public.agent_actions
  for select using (tenant_id in (select public.current_tenant_ids()));

create policy "agent_actions_insert" on public.agent_actions
  for insert with check (tenant_id in (select public.current_tenant_ids()));

create policy "agent_actions_update" on public.agent_actions
  for update using (tenant_id in (select public.current_tenant_ids()));


-- 4. Storage Bucket Setup for Receipts
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts');

create policy "Authenticated users can view receipts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts');

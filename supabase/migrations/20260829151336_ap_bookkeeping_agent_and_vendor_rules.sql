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

create policy "Tenant members can view vendor rules"
on public.vendor_rules for select
using (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

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

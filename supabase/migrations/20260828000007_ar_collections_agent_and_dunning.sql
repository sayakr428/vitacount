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

create policy "Tenant members can view dunning schedules"
on public.dunning_schedules for select
using (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

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

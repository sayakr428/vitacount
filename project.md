# VitaCount — Master Project Specification
### Financial Operating System for US SMBs — Full Architecture, Data Model, Agentic Layer & Build Roadmap
**Stack target: Supabase (MVP → production) + Next.js + Claude (agentic layer) + Plaid + Stripe**

This document is the single source of truth for building VitaCount end-to-end. It's written to be fed directly to Claude Code as persistent project context. Every module below maps to real tables, real RLS policies, real agent specs, and a real build order.

---

## PART 0 — Product Vision (from source strategy docs)

VitaCount is **not** "another QuickBooks." It's positioned as a **Financial Operating System**: QuickBooks' ecosystem maturity + Xero's reconciliation/collaboration philosophy + native ERP modules (projects, inventory) + FP&A (forecasting/scenarios) + an AI financial operator — unified by one architectural moat: **the Financial Graph**, where every operational event (an invoice, a PO, a time entry, a bank line) resolves deterministically into GL postings.

**Non-negotiable product principles carried into every technical decision below:**
1. **Zero-jargon UX, ledger-grade accuracy underneath.** Users see Money In / Money Out / Net Cash Flow. Debits/credits/journal entries exist in the same database, exposed only in **CPA Mode**.
2. **Complexity grows invisibly.** More business complexity ≠ more UI. It means more automation working quietly.
3. **Automation is a spectrum, not a toggle**: `transaction → AI analysis → confidence score → policy → auto-resolve if safe → human handles exceptions only`. Every auto-action is reversible and audited.
4. **No fragmentation.** Accounting, Banking, AR, AP, Projects, Inventory, Documents, Forecasting are native modules on one financial graph — not bolted-on apps.
5. **Unlimited users, usage-based economics.** Bill for transactions/statement-lines/AI-processing/documents/active-projects/API-calls — never seats. This is directly what differentiates VitaCount's 3 tiers ($14.99 / $79 / $159) from QuickBooks' seat caps and Xero's transaction caps (from `VitaCount_Plans.pdf`).
6. **AI is an operator, not a chatbot.** The killer feature is the Financial Command Center: "tell me what needs my attention" → surfaced issues → "Fix Everything" triggers approved workflows.

---

## PART 1 — Tech Stack Decision

| Layer | MVP (ship fast, real users) | Production evolution |
|---|---|---|
| Frontend | Next.js 15 (App Router) + Tailwind + shadcn/ui, deployed on Vercel | Same — this doesn't need to change for a long time |
| Backend/API | Supabase auto-generated REST (PostgREST) + Postgres functions for business logic + Next.js Route Handlers for anything cross-cutting | Split hot paths (posting engine, reconciliation) into dedicated services only when you have real load data proving Postgres is the bottleneck |
| Database | **Supabase Postgres** — this IS your financial core, not a cache | Same engine; add read replicas, partition large tables (journal_entry_lines, bank_transactions) by tenant/date at scale |
| Auth & multi-tenancy | Supabase Auth (email/pass + OAuth) + Postgres **Row Level Security** as the tenant boundary | Same — RLS is production-grade, not a toy. Add SSO/SAML via Supabase Auth's enterprise SSO when an enterprise client demands it |
| File storage | Supabase Storage (receipts, statements, exports) | Same, add CDN caching for generated PDFs |
| Async jobs / queue | **pgmq** (Postgres-native queue) + **pg_cron** + **Edge Functions**, per Supabase's own recommended pattern for exactly this kind of pipeline (ingest → queue → process → retry) | Introduce **Inngest** or **Trigger.dev** once agent workflows need durable, multi-step, long-running execution with visual observability — Edge Functions alone (Deno, ~150s max runtime) aren't built for multi-hour retry/backoff logic |
| Realtime | Supabase Realtime (reconciliation live updates, agent action inbox, notifications) | Same |
| Vector search / RAG | **pgvector** (HNSW index) directly in Supabase Postgres — no separate vector DB needed at this scale | Same until you're at hundreds of millions of embeddings |
| AI / LLM | **Claude API** (tool-calling) for every agent below, called from Edge Functions via a thin **LLM Gateway** function (so you can log, rate-limit, inject guardrails centrally) | Same, add prompt-caching and batch API for cost at scale |
| OCR / document extraction | Claude vision (native PDF/image understanding) as primary extractor, with confidence scoring; fall back to a dedicated OCR engine (AWS Textract or Veryfi) only if you need sub-second latency at high volume | Same |
| Bank feeds | **Plaid** (this is a US product — Plaid is the standard; not Yodlee unless a specific bank demands it) | Same, add Plaid's transaction-enrichment product once volume justifies it |
| Payments | **Stripe** — both for invoice payment collection (ACH + card) and for VitaCount's own subscription billing | Same |
| Sales tax | **TaxJar or Avalara** API — do not build US sales-tax-rate logic yourself, it's a compliance minefield (11,000+ US tax jurisdictions) | Same |
| Observability | Sentry + Supabase's built-in logs/metrics | Add Prometheus/Grafana or Datadog when you split services |
| Infra/hosting | Supabase Cloud + Vercel — literally zero DevOps for MVP | Move to dedicated Postgres (still via Supabase's paid tiers, or self-hosted Supabase on your own AWS) as you approach enterprise SLAs |

**Why Supabase is genuinely the right MVP choice here (not just "easy"):** RLS gives you real multi-tenant security at the database layer (not app-layer, which is where most SaaS security bugs live), Postgres gives you the transactional integrity a ledger *requires* (this is non-negotiable — never use an eventually-consistent DB for a GL), and pgmq+pg_cron+Edge Functions gives you a legitimate event-driven pipeline without running Kafka on day one. You can genuinely go from MVP to a real production system with real paying users on this stack without a rewrite — you'll add services around it, not replace it.

---

## PART 2 — The Financial Graph: Full Data Model

This is the architectural moat from the source strategy. Every table below either **is** the ledger, **feeds** the ledger, or **reads from** the ledger. Nothing in the system is allowed to hold a "shadow" balance that isn't reconcilable to journal entries.

### 2.1 Tenancy & Identity

```sql
-- Every financial table in this system has tenant_id + an RLS policy scoping to it.
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_tier text not null default 'starter' check (plan_tier in ('starter','growth','pro')),
  base_currency text not null default 'USD',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- profile row per Supabase auth.users, 1:many with tenants via membership
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','accountant','staff','viewer')),
  -- CPA Mode granular permissions live here, not as a separate role explosion
  permissions jsonb not null default '{}',
  invited_at timestamptz default now(),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  unique (tenant_id, user_id)
);
```

**RLS pattern (apply this exact shape to every tenant-scoped table in this document):**
```sql
alter table <table_name> enable row level security;

create policy "tenant_isolation_select" on <table_name>
  for select using (
    tenant_id in (select tenant_id from memberships where user_id = auth.uid() and status = 'active')
  );

create policy "tenant_isolation_write" on <table_name>
  for insert with check (
    tenant_id in (select tenant_id from memberships where user_id = auth.uid() and status = 'active')
  );
-- repeat for update/delete, tightened further by role where needed, e.g.:
create policy "only_accountant_plus_can_post_journal_entries" on journal_entries
  for insert with check (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid() and status = 'active' and role in ('owner','admin','accountant')
    )
  );
```
Do this via a **security-definer helper function** (`current_tenant_ids()`) rather than repeating the subquery everywhere — keeps 40+ tables' policies maintainable and fast (index `memberships(user_id, tenant_id)`).

### 2.2 Financial Core — Chart of Accounts, Dimensions, General Ledger

```sql
create table accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,                 -- e.g. "4000"
  name text not null,                 -- "Sales Revenue"
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  subtype text,                       -- "current_asset","fixed_asset","cogs", etc — display grouping only
  is_active boolean not null default true,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- Dimensional tagging: flexible metadata WITHOUT touching the GL schema (per engineering spec §1)
create table dimension_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,                 -- "Department", "Location", "Customer Segment", "Campaign"
  is_active boolean not null default true
);

create table dimension_values (
  id uuid primary key default gen_random_uuid(),
  dimension_type_id uuid not null references dimension_types(id),
  tenant_id uuid not null references tenants(id),
  value text not null,
  is_active boolean not null default true
);

-- Accounting periods, needed for period close / lock
create table periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','closed','locked')),
  unique (tenant_id, start_date, end_date)
);

-- THE LEDGER. Immutable once posted — corrections happen via reversing entries, never UPDATE/DELETE.
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  entry_date date not null,
  memo text,
  source_type text not null,          -- 'invoice','bill','payment','bank_match','manual','adjustment','inventory_cogs'
  source_id uuid,                     -- FK to whatever produced this entry (polymorphic, resolved in app layer)
  status text not null default 'posted' check (status in ('draft','posted','void')),
  period_id uuid references periods(id),
  created_by uuid references auth.users(id),
  posted_at timestamptz,
  reversal_of_id uuid references journal_entries(id),   -- self-reference for reversing entries
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

-- Many-to-many: any journal_entry_line can carry multiple dimension tags
create table journal_entry_line_dimensions (
  journal_entry_line_id uuid not null references journal_entry_lines(id) on delete cascade,
  dimension_value_id uuid not null references dimension_values(id),
  primary key (journal_entry_line_id, dimension_value_id)
);
```

**Posting-engine invariant (enforce with a Postgres trigger, not app-layer trust):**
```sql
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
```
This single trigger is what makes "ledger-grade accuracy" real instead of a marketing phrase — it's structurally impossible to post an unbalanced entry, no matter which module or which agent wrote it.

### 2.3 Contacts (Customers & Vendors)

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  type text not null check (type in ('customer','vendor','both')),
  display_name text not null,
  email text, phone text,
  billing_address jsonb, shipping_address jsonb,
  tax_id text,                        -- EIN/SSN for 1099 tracking
  payment_terms text default 'net_30',
  credit_limit numeric(14,2),
  is_1099_vendor boolean default false,
  created_at timestamptz not null default now()
);
```

### 2.4 Accounts Receivable

```sql
create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  project_id uuid references projects(id),
  invoice_number text not null,
  issue_date date not null, due_date date not null,
  status text not null default 'draft' check (status in ('draft','sent','partial','paid','overdue','void')),
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  item_id uuid references items(id),
  description text, quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null, tax_rate numeric(6,4) default 0,
  amount numeric(14,2) not null
);

create table payments_received (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  payment_date date not null, amount numeric(14,2) not null,
  method text, reference text, stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create table payment_applications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments_received(id) on delete cascade,
  invoice_id uuid not null references invoices(id),
  amount_applied numeric(14,2) not null
);
```

### 2.5 Accounts Payable

```sql
create table bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  vendor_id uuid not null references contacts(id),
  project_id uuid references projects(id),
  bill_number text, issue_date date not null, due_date date not null,
  status text not null default 'open' check (status in ('open','scheduled','partial','paid','void')),
  total numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  source_document_id uuid references documents(id),  -- links back to the OCR'd receipt/bill image
  created_at timestamptz not null default now()
);

create table bill_lines (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  account_id uuid references accounts(id),            -- expense category
  item_id uuid references items(id),
  description text, quantity numeric(12,2) default 1, unit_cost numeric(14,2), amount numeric(14,2) not null
);

create table payments_made (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  vendor_id uuid not null references contacts(id),
  payment_date date not null, amount numeric(14,2) not null,
  method text, scheduled_for date,                     -- supports "schedule vendor bill payments" from pricing doc
  created_at timestamptz not null default now()
);

create table bill_payment_applications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments_made(id) on delete cascade,
  bill_id uuid not null references bills(id),
  amount_applied numeric(14,2) not null
);
```

### 2.6 Banking & Reconciliation (the "AI control center")

```sql
create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null, institution_name text,
  account_type text, current_balance numeric(14,2),
  plaid_item_id text, plaid_account_id text,
  last_synced_at timestamptz
);

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  bank_account_id uuid not null references bank_accounts(id),
  plaid_transaction_id text unique,
  posted_date date not null, amount numeric(14,2) not null, description text,
  status text not null default 'unmatched' check (status in ('unmatched','matched','excluded')),
  created_at timestamptz not null default now()
);

-- This table IS the "2,241 auto-matched / 198 review / 32 exceptions" screen from the dashboard
create table reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  bank_transaction_id uuid not null references bank_transactions(id),
  matched_type text not null check (matched_type in ('invoice_payment','bill_payment','journal_entry','transfer','manual')),
  matched_id uuid,                        -- polymorphic FK to whatever it matched
  confidence_score numeric(4,3),          -- Sc ∈ [0,1] per engineering spec
  match_signals jsonb,                    -- {"vendor_match":0.9,"amount_exact":true,"date_proximity_days":1,"historical_pattern":0.85}
  status text not null default 'proposed' check (status in ('proposed','auto_matched','needs_review','approved','rejected')),
  created_by_agent boolean not null default false,
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 2.7 Projects & Job Costing

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid references contacts(id),
  name text not null, status text default 'active',
  budget numeric(14,2), start_date date, end_date date
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id),
  user_id uuid references auth.users(id),
  entry_date date not null, hours numeric(6,2) not null,
  billable_rate numeric(10,2), is_billable boolean default true,
  invoiced boolean default false, description text
);

-- Every cost that touches a project rolls up here, sourced from bills/expenses/POs — real-time margin
create table project_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id),
  source_type text not null check (source_type in ('bill','expense','purchase_order','time_entry')),
  source_id uuid not null, cost_category text, amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);
```

### 2.8 Native FIFO Inventory

```sql
create table items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  sku text, name text not null,
  type text not null check (type in ('inventory','service','non_inventory')),
  sales_price numeric(14,2), reorder_point numeric(12,2), reorder_qty numeric(12,2),
  is_active boolean default true
);

-- FIFO batch queue — this is what "native FIFO inventory" actually means at the schema level
create table inventory_layers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  item_id uuid not null references items(id),
  received_date date not null,
  quantity_received numeric(12,2) not null,
  quantity_remaining numeric(12,2) not null,   -- decremented as FIFO consumption happens
  unit_cost numeric(14,2) not null,
  source_type text, source_id uuid
);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  item_id uuid not null references items(id),
  movement_type text not null check (movement_type in ('receipt','sale','adjustment','transfer')),
  quantity numeric(12,2) not null, unit_cost numeric(14,2),
  layer_id uuid references inventory_layers(id),      -- which FIFO layer this movement consumed/created
  related_document_type text, related_document_id uuid,
  created_at timestamptz not null default now()
);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  vendor_id uuid not null references contacts(id),
  po_number text, status text default 'draft', expected_date date
);

create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id),
  qty_ordered numeric(12,2) not null, qty_received numeric(12,2) default 0, unit_cost numeric(14,2)
);
```
**FIFO COGS logic** (runs as a Postgres function, triggered on every `inventory_movements` insert of type `sale`): consume `inventory_layers` for that item oldest-`received_date`-first, decrementing `quantity_remaining` layer by layer until the sold quantity is covered, summing `quantity_consumed_from_layer * layer.unit_cost` = COGS for that sale → auto-posts a journal entry (`debit COGS / credit Inventory Asset`). This function is the one piece of business logic worth writing as a hand-tuned Postgres function rather than app-layer code — it needs to run inside the same transaction as the sale to guarantee layer consistency under concurrent sales.

### 2.9 Documents & OCR Pipeline

```sql
create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  uploaded_by uuid references auth.users(id),
  storage_path text not null,           -- Supabase Storage object path
  doc_type text check (doc_type in ('receipt','bill','bank_statement','other')),
  status text not null default 'pending' check (status in ('pending','processing','extracted','verified','posted','rejected')),
  ocr_confidence numeric(4,3),
  extracted_data jsonb,                 -- {vendor, line_items[], tax, total, date, terms}
  linked_bill_id uuid references bills(id),
  linked_expense_id uuid references expenses(id),
  created_at timestamptz not null default now()
);
```

### 2.10 Forecasting

```sql
create table forecast_scenarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null, is_baseline boolean default false,
  assumptions jsonb,                    -- {payment_delay_days: 15, new_hires: 2, inventory_purchase: 50000}
  created_by uuid references auth.users(id), created_at timestamptz default now()
);

create table forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  scenario_id uuid references forecast_scenarios(id),
  generated_at timestamptz default now(),
  horizon_days int check (horizon_days in (30,60,90)),
  projected_data jsonb,                 -- daily projected cash position array
  confidence_range jsonb,               -- {low, mid, high} per day
  key_drivers jsonb                     -- what's driving the projection, for explainability
);
```

### 2.11 The Agentic & Audit Backbone (central to everything in Part 6)

```sql
-- THE record of every autonomous or semi-autonomous thing the system did.
create table agent_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  agent_name text not null,             -- 'reconciliation_agent','ap_bookkeeping_agent', etc — see Part 6
  module text not null,
  trigger_event text not null,          -- what caused this run: 'bank_transaction.created', 'document.uploaded', 'cron.daily'
  input_context jsonb not null,         -- what the agent saw
  proposed_action jsonb not null,       -- what it wants to do (structured, tool-call shaped)
  confidence_score numeric(4,3),
  autonomy_level int not null check (autonomy_level between 0 and 3),  -- see Part 6.1
  status text not null default 'proposed' check (status in ('proposed','auto_executed','approved','rejected','reversed')),
  executed_at timestamptz,
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  reversal_of_id uuid references agent_actions(id),
  created_at timestamptz not null default now()
);

-- General immutable audit trail — every mutation, human or agent, lands here too
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_id text not null,
  action text not null, entity_type text not null, entity_id uuid not null,
  before jsonb, after jsonb,
  created_at timestamptz not null default now()
);

-- Vector memory for RAG-grounded categorization/matching (pgvector, HNSW index)
create extension if not exists vector;
create table transaction_embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  source_type text not null, source_id uuid not null,
  content text not null,
  embedding vector(1536)
);
create index on transaction_embeddings using hnsw (embedding vector_cosine_ops);
```

### 2.12 Usage Metering (billing tied directly to `VitaCount_Plans.pdf` tiers)

```sql
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  event_type text not null check (event_type in
    ('journal_entry_posted','statement_line_ingested','document_processed','ai_completion','api_call','active_project_day')),
  quantity numeric not null default 1,
  metadata jsonb, occurred_at timestamptz not null default now()
);
-- Aggregate nightly via pg_cron into a monthly usage_summary table that Stripe Billing meters read from.
```

---

## PART 3 — The Financial Graph: How It All Connects

This is the literal graph the strategy doc calls the moat. Read it as: **every arrow is a foreign key or a trigger-produced journal entry.**

```
Customer ──> Invoice ──> Payment Received ──> Reconciliation Match ──> Bank Transaction
    │            │                                                          │
    │            └──> Journal Entry (AR debit / Revenue credit) ────────────┘
    │                        │
    └──> Project ──> Time Entry ──┐                                  Journal Entry
              │                    ├──> Project Costs ──> Margin ──────────┘
              └──> Purchase Order ─┘         │
                        │                     └──> Forecast (driver input)
                        ▼
                 Inventory Layer (FIFO) ──> Inventory Movement ──> COGS Journal Entry
                        ▲
Vendor ──> Bill ────────┘
   │          │
   │          └──> Payment Made ──> Reconciliation Match ──> Bank Transaction
   │
   └──> Document (OCR) ──> extracted_data ──> draft Bill/Expense ──> (human/agent verify) ──> posted
```

**The rule that makes this a graph and not just a schema:** nothing is allowed to represent money moving without eventually resolving to a `journal_entry`. Reports (P&L, Balance Sheet, Cash Flow) are **views over `journal_entry_lines` joined to `accounts` and `dimension_values`** — never separately-maintained summary tables that can drift from the ledger. Materialize them (via `materialized view` or a nightly rollup table) for dashboard speed, but always with a rebuild-from-ledger path.

---

## PART 4 — Application Module Logic

### 4.1 Reconciliation Engine (the "control center")
- Plaid webhook → `bank_transactions` insert → pgmq message → Edge Function computes match candidates against open invoices/bills/journal entries.
- Signals scored: payee/vendor name similarity (embedding cosine + fuzzy string), exact amount match, date proximity window, historical pattern (has this payee/amount combo matched this way before — queried from `transaction_embeddings`).
- Confidence `Sc ∈ [0,1]`. **Sc ≥ 0.95 → auto-match** (writes `reconciliation_matches` with `status='auto_matched'`, `created_by_agent=true`, and immediately posts the linked journal entry). **0.70 ≤ Sc < 0.95 → needs_review** (surfaced in UI with the `match_signals` explanation). **Sc < 0.70 → exception**, flagged separately (possible fraud/duplicate/data-entry error).
- Every auto-match is reversible: a "reject" action on an `auto_matched` row triggers a reversing journal entry, not a delete.

### 4.2 Owner Mode vs CPA Mode
Same tables, different queries/views:
- **Owner Mode** reads: `SELECT` from views that group `journal_entry_lines` by `accounts.type` into Money In/Money Out/Net, plus `agent_actions` where `status='proposed'` (the attention feed), plus project/inventory summaries.
- **CPA Mode** reads: raw `journal_entries`/`journal_entry_lines`, trial balance view, `periods` lock controls, full `audit_log`.
- Enforced by `memberships.role` + a UI toggle — **not** two separate databases or two separate apps.

### 4.3 Custom Reporting Engine
Build the report canvas as: a `report_templates` table storing a JSON definition (rows = account groupings or dimension groupings, columns = time periods, cells = formula references), executed by a Postgres function that dynamically builds the aggregation query. Drilldown from any cell → filtered `journal_entry_lines` query with `source_type`/`source_id` joined back to the originating invoice/bill/document.

---

## PART 5 — API, Webhooks, MCP

- **REST**: expose via PostgREST (Supabase's auto-generated API) for straightforward CRUD, wrapped by Next.js Route Handlers for anything needing cross-table business logic (posting, reconciliation approval, forecast generation).
- **Webhooks**: `webhooks` + `webhook_deliveries` tables, fired via pg_cron-polled queue on events (`invoice.paid`, `bill.due_soon`, `reconciliation.exception`, `forecast.risk_detected`).
- **MCP server**: expose the same tool surface your internal agents use (see Part 6.2) to external MCP clients — an accountant's own Claude session, a client's internal tools — scoped by the same tenant RLS + OAuth grant. This is a genuine differentiator versus QuickBooks/Xero, neither of which is MCP-native today.

---

## PART 6 — THE AGENTIC LAYER (module by module)

### 6.1 Framework — applies to every agent below

**Autonomy levels** (stored per action in `agent_actions.autonomy_level`, configurable per tenant per action-type in `tenants.settings`):
- **L0 — Suggest only**: agent proposes, does nothing until a human clicks approve.
- **L1 — Draft**: agent creates a draft object (draft bill, draft journal entry) that exists but isn't posted/final until approved.
- **L2 — Auto-execute, reversible**: agent posts/executes immediately if confidence clears a threshold, but the action is structurally reversible (reversing journal entry, un-match) and shows up in a review inbox after the fact.
- **L3 — Full auto, silent**: only for actions with essentially zero downside risk (e.g., categorization suggestions feeding embeddings, non-financial notifications). Financial postings should almost never be L3 in year one.

**Shared components:**
- **LLM Gateway** (Edge Function): every agent calls Claude through this single function — centralizes logging to `agent_actions`, rate-limiting, prompt-template versioning, and tool-call validation against a JSON schema before anything touches the database.
- **Tool Registry**: the *same* tool set defined for the MCP server (Part 5) is what internal agents call — one implementation, two consumers, per the architecture principle from your Vyapar blueprint's MCP section — don't build agent tools and API tools twice.
- **Policy Engine**: a per-tenant, per-action-type config (`{"bank_auto_match_threshold": 0.95, "auto_categorize_below": 500}`) read before any L2+ action executes.
- **Review Inbox UI**: one unified surface (backed by `agent_actions where status='proposed'`) across all agents — this is literally the Financial Command Center's data source.

### 6.2 Agent specs

| Agent | Module | Trigger | Reads | Tools (write) | Default autonomy | Guardrail |
|---|---|---|---|---|---|---|
| **Reconciliation Agent** | Banking | `bank_transaction.created` (Plaid webhook) | open invoices/bills, `transaction_embeddings`, historical matches | `create_reconciliation_match`, `post_journal_entry` | L2 at Sc≥0.95, else L0 | Reversing entry on any rejected auto-match; flags duplicates as exceptions, never silently drops them |
| **AP Bookkeeping Agent** | Documents/AP | `document.uploaded` (receipt/bill scan) | OCR extraction, vendor history in `contacts`/`transaction_embeddings` | `create_draft_bill`, `create_expense`, `categorize_transaction` | L1 (draft, human verifies before posting) | Never posts a bill without a human "verify" click in year one — matches source doc's "one-click verification before final posting" |
| **AR Collections Agent** | AR | `pg_cron` daily scan of `invoices` aging | payment terms, contact history, invoice status | `send_reminder_email`, `generate_payment_link` (Stripe), `escalate_to_owner` | L2 for reminders (low risk), L0 for anything that changes invoice terms | Tone/frequency configurable per tenant; never applies late fees or alters an invoice autonomously |
| **Inventory Reorder Agent** | Inventory | `pg_cron` daily + `inventory_movements` threshold crossing | `inventory_layers.quantity_remaining` vs `items.reorder_point`, sales velocity | `create_draft_purchase_order`, `notify_owner` | L1 | Draft PO only — vendor commitment always requires human approval |
| **Project Margin Agent** | Projects | `project_costs.created` or `time_entries.created` | budget vs actual, historical margin patterns | `flag_margin_risk`, `notify_project_owner` | L0 | Pure signal/notification agent, never writes financial data |
| **Forecasting/Scenario Agent** | Forecasting | `pg_cron` daily regen + on-demand scenario request | AR/AP aging, recurring journal entry patterns, seasonality | `generate_forecast`, `run_scenario_simulation` | L2 (forecasts are read-only outputs, safe to auto-generate) | Always shows confidence range + key drivers, never presents a point estimate as certain |
| **Anomaly/Fraud Agent** | Cross-cutting | every `journal_entry` and `bank_transaction` insert | duplicate detection, amount-outlier detection vs historical patterns per vendor/account | `flag_anomaly`, `hold_transaction_for_review` | L0–L1 (can hold, never auto-delete/auto-approve) | This agent can only ever *add friction*, never remove it — asymmetric risk tolerance is intentional |
| **Command Center / Orchestrator Agent** | Cross-cutting | `pg_cron` daily + dashboard load | rolls up every other agent's proposed actions + cash/AR/inventory/margin signals | `batch_approve` (the "Fix Everything" button — executes a pre-approved bundle of L1/L2 actions in one transaction) | L0 orchestration over L1/L2 children | "Fix Everything" only ever executes actions the user could see and would have approved individually — no hidden bundling of high-risk actions |
| **Support/Troubleshooter Agent** | Cross-cutting | user opens support chat, or a webhook/sync failure is detected | error logs, `agent_actions` history, `audit_log`, current workspace state | `suggest_fix`, `escalate_to_human_support` | L0 | Read-only diagnostic agent; any fix it suggests requiring a write goes through the normal L1/L2 path of the relevant module agent |

**Build order for the agentic layer (don't build all 8 at once):** Reconciliation Agent first (highest ROI, matches Xero's core strength you need to beat), then AP Bookkeeping Agent (highest "magic" perception for users), then AR Collections, then the Command Center orchestrator once 3+ child agents exist to roll up, then Inventory/Project/Forecasting/Anomaly agents as the corresponding modules mature.

---

## PART 7 — Async/Event-Driven Processing on Supabase (concrete pattern)

Confirmed current Supabase-native pattern (not a hypothetical): **pgmq for the queue, pg_cron to poll it on an interval, Edge Functions to do the actual work, pg_net for any outbound HTTP** — this is Supabase's own documented approach for exactly this kind of ingest→process→retry pipeline (e.g. their automatic-embeddings feature uses this identical pattern). Concretely for VitaCount:

```sql
select pgmq.create('document_processing');
select pgmq.create('reconciliation_matching');
select pgmq.create('agent_actions_queue');

-- on document upload:
insert into pgmq.q_document_processing (message) values (jsonb_build_object('document_id', new.id));

-- pg_cron, every 10s, pulls a batch and invokes the Edge Function via pg_net:
select cron.schedule('process-documents', '10 seconds', $$
  select net.http_post(url := '<edge-function-url>/process-document-batch', ...);
$$);
```
Edge Function reads a batch from the queue, calls the LLM Gateway for OCR extraction, writes `agent_actions` + draft records, and archives/deletes the message on success (pgmq's visibility timeout handles retry-on-failure automatically). **Move to Inngest/Trigger.dev when** an agent workflow needs true multi-step durability (e.g., "wait 3 days, then check if invoice still unpaid, then escalate") — that's a state machine Edge Functions + cron weren't built for, and it's worth the migration once the AR Collections Agent needs it.

---

## PART 8 — Monetization Enforcement

Map `tenants.plan_tier` to a feature-flag table (`plan_features`) checked at the API layer (Route Handlers) and mirrored in RLS where it's a hard data boundary (e.g., Growth+ only gets `project_costs`/`inventory_layers` write access):
```sql
create table plan_features (
  plan_tier text primary key,
  features jsonb not null   -- {"inventory": false, "projects": false, "workflow_automation": false, "custom_reports": false}
);
```
Usage-based overage (statement lines, AI completions, documents processed) is metered via `usage_events` (Part 2.12), aggregated nightly, and pushed to **Stripe Billing's metered usage API** — this is the direct implementation of the "usage-based monetization" principle from the engineering spec and the tier structure in the pricing PDF.

---

## PART 9 — Build Roadmap (MVP → V1 → Enterprise)

| Milestone | Scope | Outcome |
|---|---|---|
| **M0 — Foundation** (1–2 wks) | Supabase project, `tenants`/`memberships`/`profiles`, RLS pattern, Next.js scaffold + auth flow | A user can sign up, create a workspace, invite a teammate |
| **M1 — Financial Core** (2–3 wks) | `accounts`, `journal_entries`/`lines`, balanced-entry trigger, `contacts` | The ledger exists and is provably correct, even with nothing built on top yet |
| **M2 — AR + AP** (3–4 wks) | Invoices, bills, payments, Stripe payment collection, auto-posting to GL | A business can bill customers and pay vendors, fully ledger-backed |
| **M3 — Banking + Reconciliation** (3–4 wks) | Plaid integration, `bank_transactions`, matching algorithm (rule-based first, agent-assisted second), review UI | The dashboard's Reconciliation Center screen becomes real |
| **M4 — Projects + Inventory** (4 wks) | `projects`/`time_entries`/`project_costs`, `items`/`inventory_layers` + FIFO COGS function | Job costing and inventory margin become real, unlocking Growth tier |
| **M5 — Documents/OCR + Owner/CPA Mode UI** (3 wks) | Upload pipeline, Claude-vision extraction, draft bill flow; dashboard split into Owner/CPA views | The "zero-jargon UX over rigorous ledger" principle ships |
| **M6 — Reporting + Forecasting** (3 wks) | Report canvas, drilldown, `forecasts`/scenario simulator | FP&A capability live — a real differentiator vs QuickBooks base tiers |
| **M7 — Agentic Layer, phase 1** (4 wks) | Agent framework (Part 6.1) + Reconciliation Agent + AP Bookkeeping Agent live | First real automation — this is what makes the product feel like "VitaCount Intelligence" from the pricing doc |
| **M8 — Agentic Layer, phase 2** (4 wks) | AR Collections, Inventory Reorder, Project Margin, Anomaly agents + Command Center orchestrator | Full "Fix Everything" experience |
| **M9 — Public API + MCP + Webhooks** (2–3 wks) | PostgREST hardening, webhook delivery system, MCP server over the shared tool registry | Opens partner/ecosystem plays |
| **M10 — Billing + Multi-tenant polish + Production hardening** (3–4 wks) | Stripe Billing usage metering, plan-feature gating, audit log completeness, load testing, SOC 2 prep | Ready for real paying customers at scale |

**Total to a genuinely production-ready, agentic V1: ~7–9 months** with a focused team (this is a materially bigger build than the Vyapar-class blueprint from earlier in this conversation, because of the dual-mode UX, dimensional tagging, and multi-agent layer — budget accordingly).

---

## PART 10 — Suggested Repo Structure (for Claude Code)

```
vitacount/
├── project.md                     ← this file, kept as living context
├── apps/
│   └── web/                       ← Next.js app (App Router)
│       ├── app/(owner)/           ← Owner Mode routes
│       ├── app/(cpa)/             ← CPA Mode routes
│       └── app/api/               ← Route Handlers for cross-table logic
├── supabase/
│   ├── migrations/                ← every table in Part 2, one migration per module
│   ├── functions/                 ← Edge Functions: llm-gateway, process-document-batch,
│   │                                 reconciliation-matcher, forecast-generator, agent-*
│   └── seed.sql
├── packages/
│   ├── tool-registry/             ← shared tool defs, consumed by agents AND MCP server
│   ├── posting-engine/            ← pure functions: given a business event, return journal lines
│   └── ui/                        ← shared shadcn/ui components, Owner/CPA themed
└── mcp-server/                    ← standalone MCP server process, calls tool-registry
```

**Recommended Claude Code working pattern:** feed this `project.md` as persistent context at the start of every session, work module-by-module in the milestone order in Part 9, and for each module: (1) write the migration, (2) write RLS policies, (3) write the posting-engine function if it produces journal entries, (4) write the API/route handler, (5) write the UI, (6) only then wire the relevant agent from Part 6. Resist building agent automation before the underlying module's manual flow is solid — every agent in this doc is designed to sit on top of a working human-operable feature, not replace an unbuilt one.

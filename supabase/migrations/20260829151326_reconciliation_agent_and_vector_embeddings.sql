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

create policy "Tenant members can view transaction embeddings"
on public.transaction_embeddings for select
using (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

create policy "Tenant members can insert transaction embeddings"
on public.transaction_embeddings for insert
with check (
  tenant_id in (
    select tenant_id from public.memberships where user_id = auth.uid()
  )
);

-- tenants.settings already exists (Session 2), so the column-level default above
-- would be a no-op for every tenant created before this migration — backfill the
-- key explicitly instead, without clobbering any other settings already present.
alter table public.tenants add column if not exists settings jsonb default '{"auto_match_threshold": 0.95}'::jsonb;
update public.tenants
set settings = settings || '{"auto_match_threshold": 0.95}'::jsonb
where not (settings ? 'auto_match_threshold');

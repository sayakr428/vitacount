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
left join public.contacts c on c.id = i.contact_id

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
left join public.contacts c on c.id = pr.contact_id

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

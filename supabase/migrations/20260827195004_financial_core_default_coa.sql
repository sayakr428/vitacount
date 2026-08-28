-- Default US Chart of Accounts, seeded automatically on tenant creation.
--
-- NOTE: this version has a bug — "Owner's Equity" below uses double quotes,
-- which Postgres parses as a quoted *identifier*, not a string literal. It
-- was caught immediately (before any real tenant relied on it) and fixed in
-- the next migration (financial_core_default_coa_fix_quoting). Kept as-is
-- here since migrations are an append-only log — see CONTEXT_LOG.md.

create or replace function public.seed_default_chart_of_accounts(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into accounts (tenant_id, code, name, type, subtype) values
    (p_tenant_id, '1000', 'Cash', 'asset', 'current_asset'),
    (p_tenant_id, '1010', 'Accounts Receivable', 'asset', 'current_asset'),
    (p_tenant_id, '1020', 'Undeposited Funds', 'asset', 'current_asset'),
    (p_tenant_id, '1200', 'Inventory Asset', 'asset', 'current_asset'),
    (p_tenant_id, '2000', 'Accounts Payable', 'liability', 'current_liability'),
    (p_tenant_id, '2010', 'Sales Tax Payable', 'liability', 'current_liability'),
    (p_tenant_id, '2020', 'Credit Card Payable', 'liability', 'current_liability'),
    (p_tenant_id, '3000', "Owner's Equity", 'equity', null),
    (p_tenant_id, '3010', 'Retained Earnings', 'equity', null),
    (p_tenant_id, '4000', 'Sales Revenue', 'revenue', null),
    (p_tenant_id, '4010', 'Service Revenue', 'revenue', null),
    (p_tenant_id, '5000', 'Cost of Goods Sold', 'expense', 'cogs'),
    (p_tenant_id, '6000', 'Advertising & Marketing', 'expense', 'operating_expense'),
    (p_tenant_id, '6010', 'Bank Fees & Charges', 'expense', 'operating_expense'),
    (p_tenant_id, '6020', 'Insurance', 'expense', 'operating_expense'),
    (p_tenant_id, '6030', 'Office Supplies', 'expense', 'operating_expense'),
    (p_tenant_id, '6040', 'Payroll Expenses', 'expense', 'operating_expense'),
    (p_tenant_id, '6050', 'Professional Fees', 'expense', 'operating_expense'),
    (p_tenant_id, '6060', 'Rent Expense', 'expense', 'operating_expense'),
    (p_tenant_id, '6070', 'Software & Subscriptions', 'expense', 'operating_expense'),
    (p_tenant_id, '6080', 'Travel & Meals', 'expense', 'operating_expense'),
    (p_tenant_id, '6090', 'Utilities', 'expense', 'operating_expense'),
    (p_tenant_id, '6900', 'Uncategorized Expense', 'expense', 'operating_expense');
end;
$$;

revoke execute on function public.seed_default_chart_of_accounts(uuid) from public, anon, authenticated;

-- hook the seed into onboarding
create or replace function public.create_tenant(tenant_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into tenants (name) values (tenant_name) returning id into new_tenant_id;

  insert into memberships (tenant_id, user_id, role, status)
  values (new_tenant_id, auth.uid(), 'owner', 'active');

  perform seed_default_chart_of_accounts(new_tenant_id);

  return new_tenant_id;
end;
$$;

-- Fixes the "Owner's Equity" identifier/string-literal bug from the previous
-- migration (double-quoted -> properly escaped single-quoted string).
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
    (p_tenant_id, '3000', 'Owner''s Equity', 'equity', null),
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

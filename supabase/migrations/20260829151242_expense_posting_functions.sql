-- Session 6: Expense Posting RPC Functions & Security Lockdown

-- Creates and posts a non-bill expense directly into the double-entry GL
create or replace function public.post_expense_created(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_expense_date date,
  p_amount numeric,
  p_account_id uuid, -- Category/Expense account
  p_payment_method text,
  p_memo text,
  p_document_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_cash_account_id uuid;
  v_entry_id uuid;
begin
  -- Enforce tenant membership
  if not exists (
    select 1 from public.memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  -- Cash / Bank default account (Code 1000)
  select id into v_cash_account_id from public.accounts where tenant_id = p_tenant_id and code = '1000';
  if v_cash_account_id is null then
    raise exception 'tenant % is missing standard Cash account (code 1000)', p_tenant_id;
  end if;

  -- Insert Expense row
  insert into public.expenses (
    tenant_id, contact_id, expense_date, amount, account_id,
    receipt_document_id, status, payment_method, memo, created_by
  ) values (
    p_tenant_id, p_contact_id, p_expense_date, p_amount, p_account_id,
    p_document_id, 'posted', coalesce(p_payment_method, 'cash'), p_memo, auth.uid()
  ) returning id into v_expense_id;

  -- Create Journal Entry (GL)
  insert into public.journal_entries (
    tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by
  ) values (
    p_tenant_id, p_expense_date, coalesce(p_memo, 'Expense payment'), 'expense', v_expense_id, 'posted', now(), auth.uid()
  ) returning id into v_entry_id;

  -- Debit Expense Category Account
  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, p_account_id, p_amount, 0, p_memo);

  -- Credit Cash / Bank Account
  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_cash_account_id, 0, p_amount, 'Cash Outflow');

  -- Link back to document if provided
  if p_document_id is not null then
    update public.documents
    set linked_expense_id = v_expense_id, status = 'posted'
    where id = p_document_id and tenant_id = p_tenant_id;
  end if;

  return v_expense_id;
end;
$$;

-- Grant execution to authenticated users, revoke from public and anon
grant execute on function public.post_expense_created(uuid, uuid, date, numeric, uuid, text, text, uuid) to authenticated;
revoke execute on function public.post_expense_created(uuid, uuid, date, numeric, uuid, text, text, uuid) from public, anon;

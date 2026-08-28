-- Session 4: AR posting functions.
--
-- Both are SECURITY DEFINER, deliberately unlike post_manual_journal_entry (Session 3).
-- Rationale (also in CONTEXT_LOG.md): a manual journal entry in CPA Mode is a direct
-- ledger action and correctly requires owner/admin/accountant per journal_entries' RLS.
-- Issuing an invoice or recording a payment is a normal Owner Mode business action —
-- per project.md's "complexity grows invisibly" principle, any active tenant member
-- who can create an invoice should be able to trigger its (correct, structurally
-- balanced) GL posting without also needing accountant-level ledger permissions.
-- Authorization is still enforced inside each function via an explicit membership
-- check; the security-definer privilege only bypasses journal_entries' *role*
-- restriction, not tenant isolation.

create or replace function public.post_invoice_issued(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
  v_ar_account_id uuid;
  v_revenue_account_id uuid;
  v_tax_account_id uuid;
  v_entry_id uuid;
begin
  select * into v_invoice from invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice % not found', p_invoice_id;
  end if;

  if not exists (
    select 1 from memberships
    where tenant_id = v_invoice.tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice % has already been issued (status=%)', p_invoice_id, v_invoice.status;
  end if;

  select id into v_ar_account_id from accounts where tenant_id = v_invoice.tenant_id and code = '1010';
  select id into v_revenue_account_id from accounts where tenant_id = v_invoice.tenant_id and code = '4000';
  select id into v_tax_account_id from accounts where tenant_id = v_invoice.tenant_id and code = '2010';

  if v_ar_account_id is null or v_revenue_account_id is null then
    raise exception 'tenant % is missing the standard AR/Revenue accounts (codes 1010/4000)', v_invoice.tenant_id;
  end if;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (v_invoice.tenant_id, v_invoice.issue_date, 'Invoice ' || v_invoice.invoice_number || ' issued', 'invoice', v_invoice.id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_ar_account_id, v_invoice.total, 0, 'Invoice ' || v_invoice.invoice_number);

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_revenue_account_id, 0, v_invoice.subtotal, 'Invoice ' || v_invoice.invoice_number);

  if v_invoice.tax_total > 0 then
    if v_tax_account_id is null then
      raise exception 'tenant % is missing the Sales Tax Payable account (code 2010)', v_invoice.tenant_id;
    end if;
    insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
    values (v_entry_id, v_tax_account_id, 0, v_invoice.tax_total, 'Sales tax on ' || v_invoice.invoice_number);
  end if;

  update invoices set status = 'sent', balance_due = total where id = p_invoice_id;

  return v_entry_id;
end;
$$;

grant execute on function public.post_invoice_issued(uuid) to authenticated;

-- Records a payment against one or more invoices, applies it, and posts the GL entry
-- in one transaction. Callable both by an authenticated member (manual "record payment")
-- and by the service-role client from the Stripe webhook handler (auth.uid() is null
-- there, so the membership check is skipped for service_role — the webhook route itself
-- is the auth boundary in that path, gated on Stripe's signature verification).
create or replace function public.post_payment_received(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_stripe_payment_intent_id text,
  p_applications jsonb -- [{ "invoiceId": uuid, "amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_cash_account_id uuid;
  v_ar_account_id uuid;
  v_entry_id uuid;
  v_app jsonb;
  v_total_applied numeric := 0;
  v_new_balance numeric;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if jsonb_array_length(p_applications) = 0 then
    raise exception 'a payment must be applied to at least one invoice';
  end if;

  select id into v_cash_account_id from accounts where tenant_id = p_tenant_id and code = '1000';
  select id into v_ar_account_id from accounts where tenant_id = p_tenant_id and code = '1010';

  if v_cash_account_id is null or v_ar_account_id is null then
    raise exception 'tenant % is missing the standard Cash/AR accounts (codes 1000/1010)', p_tenant_id;
  end if;

  insert into payments_received (tenant_id, contact_id, payment_date, amount, method, reference, stripe_payment_intent_id, created_by)
  values (p_tenant_id, p_contact_id, p_payment_date, p_amount, p_method, p_reference, p_stripe_payment_intent_id, auth.uid())
  returning id into v_payment_id;

  for v_app in select * from jsonb_array_elements(p_applications)
  loop
    insert into payment_applications (payment_id, invoice_id, amount_applied)
    values (v_payment_id, (v_app->>'invoiceId')::uuid, (v_app->>'amount')::numeric);

    v_total_applied := v_total_applied + (v_app->>'amount')::numeric;

    update invoices
    set balance_due = balance_due - (v_app->>'amount')::numeric,
        status = case
          when balance_due - (v_app->>'amount')::numeric <= 0 then 'paid'
          else 'partial'
        end
    where id = (v_app->>'invoiceId')::uuid and tenant_id = p_tenant_id
    returning balance_due into v_new_balance;

    if not found then
      raise exception 'invoice % does not belong to tenant %', (v_app->>'invoiceId')::uuid, p_tenant_id;
    end if;
    if v_new_balance < 0 then
      raise exception 'payment application overpays invoice % by %', (v_app->>'invoiceId')::uuid, -v_new_balance;
    end if;
  end loop;

  if round(v_total_applied, 2) <> round(p_amount, 2) then
    raise exception 'payment applications (%) must sum to the payment amount (%)', v_total_applied, p_amount;
  end if;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, p_payment_date, 'Payment received', 'payment_received', v_payment_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_cash_account_id, p_amount, 0);

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_ar_account_id, 0, p_amount);

  return v_payment_id;
end;
$$;

grant execute on function public.post_payment_received(uuid, uuid, date, numeric, text, text, text, jsonb) to authenticated;
grant execute on function public.post_payment_received(uuid, uuid, date, numeric, text, text, text, jsonb) to service_role;

-- Session 5: AP posting functions. Both SECURITY DEFINER — same rationale as the
-- Session 4 AR posting functions (see that migration's header comment).
--
-- Unlike invoices (which start 'draft' and post on send), bills' own status enum
-- has no 'draft' state — a vendor bill is a real liability the moment it's recorded,
-- so create_bill_received creates the bill, its lines, and the GL entry atomically
-- in one call rather than a separate create-then-post step.

create or replace function public.create_bill_received(
  p_tenant_id uuid,
  p_vendor_id uuid,
  p_bill_number text,
  p_issue_date date,
  p_due_date date,
  p_lines jsonb -- [{ "accountId": uuid, "description": text, "quantity": numeric, "unitCost": numeric, "amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill_id uuid;
  v_ap_account_id uuid;
  v_entry_id uuid;
  v_line jsonb;
  v_total numeric := 0;
  v_sort int := 0;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'a bill needs at least one line';
  end if;

  select id into v_ap_account_id from accounts where tenant_id = p_tenant_id and code = '2000';
  if v_ap_account_id is null then
    raise exception 'tenant % is missing the standard Accounts Payable account (code 2000)', p_tenant_id;
  end if;

  insert into bills (tenant_id, vendor_id, bill_number, issue_date, due_date, status, created_by)
  values (p_tenant_id, p_vendor_id, p_bill_number, p_issue_date, p_due_date, 'open', auth.uid())
  returning id into v_bill_id;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, p_issue_date, 'Bill ' || coalesce(p_bill_number, v_bill_id::text) || ' received', 'bill', v_bill_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into bill_lines (bill_id, account_id, description, quantity, unit_cost, amount, sort_order)
    values (
      v_bill_id,
      (v_line->>'accountId')::uuid,
      v_line->>'description',
      coalesce((v_line->>'quantity')::numeric, 1),
      (v_line->>'unitCost')::numeric,
      (v_line->>'amount')::numeric,
      v_sort
    );

    insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
    values (v_entry_id, (v_line->>'accountId')::uuid, (v_line->>'amount')::numeric, 0, v_line->>'description');

    v_total := v_total + (v_line->>'amount')::numeric;
    v_sort := v_sort + 1;
  end loop;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_ap_account_id, 0, v_total, 'Bill ' || coalesce(p_bill_number, v_bill_id::text));

  update bills set total = v_total, balance_due = v_total where id = v_bill_id;

  return v_bill_id;
end;
$$;

grant execute on function public.create_bill_received(uuid, uuid, text, date, date, jsonb) to authenticated;

-- Records (and, unless scheduled for a future date, immediately posts) a vendor
-- payment against one or more bills. Mirrors post_payment_received.
create or replace function public.post_vendor_payment_made(
  p_tenant_id uuid,
  p_vendor_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_scheduled_for date,
  p_applications jsonb -- [{ "billId": uuid, "amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_app jsonb;
  v_is_future_scheduled boolean;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  v_is_future_scheduled := p_scheduled_for is not null and p_scheduled_for > current_date;

  insert into payments_made (tenant_id, vendor_id, payment_date, amount, method, scheduled_for, created_by)
  values (p_tenant_id, p_vendor_id, p_payment_date, p_amount, p_method, p_scheduled_for, auth.uid())
  returning id into v_payment_id;

  if v_is_future_scheduled then
    -- Scheduled for a future date: record the intent only. bill_payment_applications
    -- and the GL entry are created later by execute_scheduled_vendor_payment, either
    -- on the scheduled date or via a manual "process now" trigger.
    for v_app in select * from jsonb_array_elements(p_applications)
    loop
      update bills set status = 'scheduled' where id = (v_app->>'billId')::uuid and tenant_id = p_tenant_id;
    end loop;
    return v_payment_id;
  end if;

  perform public._apply_vendor_payment(v_payment_id, p_tenant_id, p_amount, p_applications);
  return v_payment_id;
end;
$$;

-- Shared application + GL-posting logic, used by both the immediate path above and
-- execute_scheduled_vendor_payment below. Not exposed to authenticated directly —
-- callers must go through one of those two entry points, which own the authorization
-- and scheduling checks.
create or replace function public._apply_vendor_payment(
  p_payment_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_applications jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ap_account_id uuid;
  v_cash_account_id uuid;
  v_entry_id uuid;
  v_app jsonb;
  v_total_applied numeric := 0;
  v_new_balance numeric;
begin
  if jsonb_array_length(p_applications) = 0 then
    raise exception 'a payment must be applied to at least one bill';
  end if;

  select id into v_ap_account_id from accounts where tenant_id = p_tenant_id and code = '2000';
  select id into v_cash_account_id from accounts where tenant_id = p_tenant_id and code = '1000';
  if v_ap_account_id is null or v_cash_account_id is null then
    raise exception 'tenant % is missing the standard AP/Cash accounts (codes 2000/1000)', p_tenant_id;
  end if;

  for v_app in select * from jsonb_array_elements(p_applications)
  loop
    insert into bill_payment_applications (payment_id, bill_id, amount_applied)
    values (p_payment_id, (v_app->>'billId')::uuid, (v_app->>'amount')::numeric);

    v_total_applied := v_total_applied + (v_app->>'amount')::numeric;

    update bills
    set balance_due = balance_due - (v_app->>'amount')::numeric,
        status = case
          when balance_due - (v_app->>'amount')::numeric <= 0 then 'paid'
          else 'partial'
        end
    where id = (v_app->>'billId')::uuid and tenant_id = p_tenant_id
    returning balance_due into v_new_balance;

    if not found then
      raise exception 'bill % does not belong to tenant %', (v_app->>'billId')::uuid, p_tenant_id;
    end if;
    if v_new_balance < 0 then
      raise exception 'payment application overpays bill % by %', (v_app->>'billId')::uuid, -v_new_balance;
    end if;
  end loop;

  if round(v_total_applied, 2) <> round(p_amount, 2) then
    raise exception 'payment applications (%) must sum to the payment amount (%)', v_total_applied, p_amount;
  end if;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, current_date, 'Vendor payment made', 'payment_made', p_payment_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_ap_account_id, p_amount, 0);

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_cash_account_id, 0, p_amount);
end;
$$;

-- Manual (or, later, pg_cron-triggered) execution of a previously-scheduled payment.
create or replace function public.execute_scheduled_vendor_payment(
  p_payment_id uuid,
  p_applications jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments_made%rowtype;
begin
  select * into v_payment from payments_made where id = p_payment_id;
  if not found then
    raise exception 'payment % not found', p_payment_id;
  end if;

  if not exists (
    select 1 from memberships
    where tenant_id = v_payment.tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if exists (select 1 from bill_payment_applications where payment_id = p_payment_id) then
    raise exception 'payment % has already been executed', p_payment_id;
  end if;

  perform public._apply_vendor_payment(p_payment_id, v_payment.tenant_id, v_payment.amount, p_applications);
end;
$$;

grant execute on function public.post_vendor_payment_made(uuid, uuid, date, numeric, text, date, jsonb) to authenticated;
grant execute on function public.execute_scheduled_vendor_payment(uuid, jsonb) to authenticated;
revoke execute on function public._apply_vendor_payment(uuid, uuid, numeric, jsonb) from public, anon, authenticated;

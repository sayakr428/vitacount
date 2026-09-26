-- Sales & purchase documents, payment terms, and lump-sum payments.
--
-- Client feedback round (see CONTEXT_LOG.md, 2026-09-24). Everything below is
-- additive or a same-signature CREATE OR REPLACE — no existing caller breaks:
--
--   1. Due dates become optional on invoices and bills ("leave blank or pick
--      manually"). Payment terms (Net 15/30/…) are a form-level shortcut that
--      fills the due date; the label is derived from issue→due distance when
--      displayed, so no terms column is needed.
--   2. Tax rates get more precision (8.875% NYC-style rates no longer round to
--      8.88%) and a 0–100% guard for new rows — the old form stored whatever was
--      typed, so "10" meaning 10% was saved as a 1000% rate.
--   3. `invoices` gains document types: sales_receipt (paid on the spot),
--      refund_receipt (money back to a customer), debit_note (extra charge that
--      raises what the customer owes). `bills` gains vendor_credit (a supplier
--      credit / debit note that lowers what we owe). One table per side keeps
--      numbering, lines, detail pages, and print templates shared.
--   4. Lump-sum payments: post_payment_received now accepts a payment that is
--      larger than the invoices it's applied to — the remainder is kept as
--      customer credit (unapplied_amount), applied later with
--      apply_customer_credit or paid back with refund_customer_credit.
--      pay_vendor_bills is the supplier-side mirror (multi-bill, dated on the
--      real payment date, with a reference/check number).
--
-- All posting functions follow the Session 4/5 pattern: SECURITY DEFINER with an
-- explicit active-membership check, and every referenced contact/account/document
-- is re-checked against p_tenant_id (the definer privilege bypasses RLS, so the
-- tenant boundary has to be enforced in the function body).

-- ---------------------------------------------------------------------------
-- 1. Optional due dates
-- ---------------------------------------------------------------------------
alter table public.invoices alter column due_date drop not null;
alter table public.bills alter column due_date drop not null;

-- ---------------------------------------------------------------------------
-- 2. Tax-rate precision + range guard (rates are stored as fractions: 0.0825 = 8.25%)
-- ---------------------------------------------------------------------------
alter table public.invoice_lines alter column tax_rate type numeric(9, 6);
alter table public.tenants alter column default_tax_rate type numeric(9, 6);

-- NOT VALID: enforced for every new/updated row without failing on any legacy
-- rows that were saved with a percent-as-fraction mistake.
alter table public.invoice_lines
  add constraint invoice_lines_tax_rate_range check (tax_rate >= 0 and tax_rate <= 1) not valid;

-- ---------------------------------------------------------------------------
-- 3. Document types
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column document_type text not null default 'invoice'
    check (document_type in ('invoice', 'sales_receipt', 'refund_receipt', 'debit_note')),
  add column payment_method text,
  add column payment_reference text,
  -- refund_receipt only: 'sale' = goods/services returned (reverses revenue),
  -- 'credit' = paying back a customer's unused credit balance (clears AR credit).
  add column refund_source text check (refund_source in ('sale', 'credit'));

alter table public.invoices
  add constraint invoices_refund_source_matches_type
  check ((document_type = 'refund_receipt') = (refund_source is not null));

create index invoices_tenant_type_idx on public.invoices (tenant_id, document_type);

alter table public.bills
  add column document_type text not null default 'bill'
    check (document_type in ('bill', 'vendor_credit'));

create index bills_tenant_type_idx on public.bills (tenant_id, document_type);

-- ---------------------------------------------------------------------------
-- 4. Credits & payment details
-- ---------------------------------------------------------------------------
alter table public.payments_received
  add column unapplied_amount numeric(14, 2) not null default 0 check (unapplied_amount >= 0);

alter table public.payment_applications
  add column created_at timestamptz not null default now();

alter table public.payments_made
  add column reference text;

-- Supplier credits applied against bills. No GL entry: both sides live in AP.
create table public.vendor_credit_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  vendor_credit_id uuid not null references public.bills(id),
  bill_id uuid not null references public.bills(id),
  amount_applied numeric(14, 2) not null check (amount_applied > 0),
  applied_on date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index vendor_credit_applications_tenant_idx on public.vendor_credit_applications (tenant_id);
create index vendor_credit_applications_credit_idx on public.vendor_credit_applications (vendor_credit_id);
create index vendor_credit_applications_bill_idx on public.vendor_credit_applications (bill_id);

alter table public.vendor_credit_applications enable row level security;

-- Read-only to members; rows are only ever written by apply_vendor_credits.
create policy "vendor_credit_applications_select" on public.vendor_credit_applications
  for select using (tenant_id in (select public.current_tenant_ids()));

-- ---------------------------------------------------------------------------
-- 5. Numbering: INV-0001 / SR-0001 / RF-0001 / DN-0001
-- ---------------------------------------------------------------------------
-- max(suffix)+1 rather than count(*)+1: deleting a draft no longer makes the
-- next number collide with an existing one, and numbers past 9999 are no
-- longer truncated by lpad.
create or replace function public.next_document_number(p_tenant_id uuid, p_document_type text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_prefix text;
  v_next bigint;
begin
  v_prefix := case p_document_type
    when 'invoice' then 'INV'
    when 'sales_receipt' then 'SR'
    when 'refund_receipt' then 'RF'
    when 'debit_note' then 'DN'
  end;

  if v_prefix is null then
    raise exception 'unknown sales document type %', p_document_type;
  end if;

  select coalesce(max(substring(invoice_number from '^' || v_prefix || '-([0-9]+)$')::bigint), 0) + 1
    into v_next
    from invoices
   where tenant_id = p_tenant_id;

  return v_prefix || '-' || case
    when length(v_next::text) >= 4 then v_next::text
    else lpad(v_next::text, 4, '0')
  end;
end;
$$;

create or replace function public.next_invoice_number(p_tenant_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select public.next_document_number(p_tenant_id, 'invoice');
$$;

-- ---------------------------------------------------------------------------
-- 6. create_sales_document — invoice / sales receipt / refund / debit note
-- ---------------------------------------------------------------------------
-- Creates the header and lines atomically and recomputes every total server-side
-- (the form's totals are a preview only). Invoices and debit notes stay 'draft'
-- until post_invoice_issued; sales receipts and refunds settle immediately, so
-- they're posted here in the same transaction:
--   sales receipt: Dr Cash / Cr Revenue / Cr Sales Tax Payable
--   refund:        Dr Revenue / Dr Sales Tax Payable / Cr Cash
create or replace function public.create_sales_document(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_document_type text,
  p_issue_date date,
  p_due_date date,
  p_payment_method text,
  p_payment_reference text,
  p_lines jsonb -- [{ "description": text, "quantity": numeric, "unitPrice": numeric, "taxRate": numeric (fraction) }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_receipt boolean;
  v_doc_id uuid;
  v_number text;
  v_line jsonb;
  v_line_no int := 0;
  v_qty numeric;
  v_price numeric;
  v_rate numeric;
  v_amount numeric;
  v_subtotal numeric := 0;
  v_tax_raw numeric := 0;
  v_tax numeric;
  v_total numeric;
  v_cash_id uuid;
  v_revenue_id uuid;
  v_tax_id uuid;
  v_entry_id uuid;
  v_label text;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if p_document_type is null or p_document_type not in ('invoice', 'sales_receipt', 'refund_receipt', 'debit_note') then
    raise exception 'unknown sales document type %', p_document_type;
  end if;
  v_is_receipt := p_document_type in ('sales_receipt', 'refund_receipt');

  if not exists (select 1 from contacts where id = p_contact_id and tenant_id = p_tenant_id) then
    raise exception 'customer % does not belong to this workspace', p_contact_id;
  end if;

  if p_issue_date is null then
    raise exception 'a date is required';
  end if;
  if not v_is_receipt and p_due_date is not null and p_due_date < p_issue_date then
    raise exception 'the due date can''t be before the issue date';
  end if;
  if v_is_receipt and coalesce(trim(p_payment_method), '') = '' then
    raise exception 'choose how the money was paid';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'add at least one line item';
  end if;

  -- Serialize numbering per tenant so two concurrent saves can't claim the same number.
  perform pg_advisory_xact_lock(hashtext('vitacount.sales_document_number'), hashtext(p_tenant_id::text));
  v_number := next_document_number(p_tenant_id, p_document_type);

  insert into invoices (
    tenant_id, contact_id, invoice_number, document_type, issue_date, due_date, status,
    payment_method, payment_reference, refund_source, created_by
  ) values (
    p_tenant_id, p_contact_id, v_number, p_document_type, p_issue_date,
    case when v_is_receipt then null else p_due_date end,
    'draft',
    case when v_is_receipt then trim(p_payment_method) end,
    case when v_is_receipt then nullif(trim(p_payment_reference), '') end,
    case when p_document_type = 'refund_receipt' then 'sale' end,
    auth.uid()
  )
  returning id into v_doc_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    v_qty := round((v_line->>'quantity')::numeric, 2);
    v_price := round((v_line->>'unitPrice')::numeric, 2);
    v_rate := round(coalesce((v_line->>'taxRate')::numeric, 0), 6);

    if v_qty is null or v_qty <= 0 then
      raise exception 'line % needs a quantity above zero', v_line_no;
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'line % needs a price of zero or more', v_line_no;
    end if;
    if v_rate < 0 or v_rate > 1 then
      raise exception 'line % has a tax rate outside 0%%–100%%', v_line_no;
    end if;

    v_amount := round(v_qty * v_price, 2);

    insert into invoice_lines (invoice_id, description, quantity, unit_price, tax_rate, amount, sort_order)
    values (v_doc_id, nullif(trim(v_line->>'description'), ''), v_qty, v_price, v_rate, v_amount, v_line_no - 1);

    v_subtotal := v_subtotal + v_amount;
    v_tax_raw := v_tax_raw + v_amount * v_rate;
  end loop;

  v_tax := round(v_tax_raw, 2);
  v_total := v_subtotal + v_tax;

  if v_total <= 0 then
    raise exception 'the total must be more than zero';
  end if;

  update invoices set subtotal = v_subtotal, tax_total = v_tax, total = v_total where id = v_doc_id;

  if v_is_receipt then
    select id into v_cash_id from accounts where tenant_id = p_tenant_id and code = '1000';
    select id into v_revenue_id from accounts where tenant_id = p_tenant_id and code = '4000';
    select id into v_tax_id from accounts where tenant_id = p_tenant_id and code = '2010';

    if v_cash_id is null or v_revenue_id is null then
      raise exception 'tenant % is missing the standard Cash/Revenue accounts (codes 1000/4000)', p_tenant_id;
    end if;
    if v_tax > 0 and v_tax_id is null then
      raise exception 'tenant % is missing the Sales Tax Payable account (code 2010)', p_tenant_id;
    end if;

    v_label := case p_document_type when 'sales_receipt' then 'Sales receipt ' else 'Refund ' end || v_number;

    insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
    values (p_tenant_id, p_issue_date, v_label, p_document_type, v_doc_id, 'posted', now(), auth.uid())
    returning id into v_entry_id;

    if p_document_type = 'sales_receipt' then
      insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
      values (v_entry_id, v_cash_id, v_total, 0, v_label),
             (v_entry_id, v_revenue_id, 0, v_subtotal, v_label);
      if v_tax > 0 then
        insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
        values (v_entry_id, v_tax_id, 0, v_tax, 'Sales tax on ' || v_number);
      end if;
    else
      insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
      values (v_entry_id, v_revenue_id, v_subtotal, 0, v_label),
             (v_entry_id, v_cash_id, 0, v_total, v_label);
      if v_tax > 0 then
        insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
        values (v_entry_id, v_tax_id, v_tax, 0, 'Sales tax refunded on ' || v_number);
      end if;
    end if;

    update invoices set status = 'paid', balance_due = 0 where id = v_doc_id;
  end if;

  return v_doc_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. post_invoice_issued — now also issues debit notes
-- ---------------------------------------------------------------------------
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
  v_label text;
begin
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id;
  end if;

  if not exists (
    select 1 from memberships
    where tenant_id = v_invoice.tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if v_invoice.document_type not in ('invoice', 'debit_note') then
    raise exception '% is posted when it''s created and can''t be issued again', v_invoice.invoice_number;
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

  v_label := case v_invoice.document_type when 'debit_note' then 'Debit note ' else 'Invoice ' end
             || v_invoice.invoice_number;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (v_invoice.tenant_id, v_invoice.issue_date, v_label || ' issued', v_invoice.document_type, v_invoice.id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_ar_account_id, v_invoice.total, 0, v_label);

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_revenue_account_id, 0, v_invoice.subtotal, v_label);

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

-- ---------------------------------------------------------------------------
-- 8. post_payment_received — lump sums, partial payments, overpayment → credit
-- ---------------------------------------------------------------------------
-- Same signature as Session 4 (the Stripe webhook and the single-invoice form
-- keep working unchanged). Changes:
--   - applications may total LESS than the payment; the rest is kept as customer
--     credit (payments_received.unapplied_amount). The GL is unchanged — the
--     whole payment still credits AR, which is exactly what a customer credit is.
--   - applications may be empty (a prepayment/deposit with nothing to apply to).
--   - each application must be > 0, target an issued invoice/debit note of the
--     SAME customer, and not overpay it. Invoice rows are locked while applied.
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
  v_amount numeric;
  v_payment_id uuid;
  v_cash_account_id uuid;
  v_ar_account_id uuid;
  v_entry_id uuid;
  v_app jsonb;
  v_app_amount numeric;
  v_invoice invoices%rowtype;
  v_new_balance numeric;
  v_total_applied numeric := 0;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'enter a payment amount greater than zero';
  end if;
  if p_payment_date is null then
    raise exception 'a payment date is required';
  end if;

  if not exists (select 1 from contacts where id = p_contact_id and tenant_id = p_tenant_id) then
    raise exception 'customer % does not belong to this workspace', p_contact_id;
  end if;

  p_applications := coalesce(p_applications, '[]'::jsonb);
  if jsonb_typeof(p_applications) <> 'array' then
    raise exception 'malformed payment applications';
  end if;

  select id into v_cash_account_id from accounts where tenant_id = p_tenant_id and code = '1000';
  select id into v_ar_account_id from accounts where tenant_id = p_tenant_id and code = '1010';

  if v_cash_account_id is null or v_ar_account_id is null then
    raise exception 'tenant % is missing the standard Cash/AR accounts (codes 1000/1010)', p_tenant_id;
  end if;

  insert into payments_received (tenant_id, contact_id, payment_date, amount, method, reference, stripe_payment_intent_id, created_by)
  values (p_tenant_id, p_contact_id, p_payment_date, v_amount, p_method, p_reference, p_stripe_payment_intent_id, auth.uid())
  returning id into v_payment_id;

  for v_app in select * from jsonb_array_elements(p_applications)
  loop
    v_app_amount := round((v_app->>'amount')::numeric, 2);
    if v_app_amount is null or v_app_amount <= 0 then
      raise exception 'each amount applied to an invoice must be more than zero';
    end if;

    select * into v_invoice
      from invoices
     where id = (v_app->>'invoiceId')::uuid and tenant_id = p_tenant_id
       for update;

    if not found then
      raise exception 'invoice % does not belong to tenant %', (v_app->>'invoiceId'), p_tenant_id;
    end if;
    if v_invoice.contact_id <> p_contact_id then
      raise exception '% belongs to a different customer', v_invoice.invoice_number;
    end if;
    if v_invoice.document_type not in ('invoice', 'debit_note')
       or v_invoice.status not in ('sent', 'partial', 'overdue') then
      raise exception '% is not open for payment (status %)', v_invoice.invoice_number, v_invoice.status;
    end if;

    v_new_balance := v_invoice.balance_due - v_app_amount;
    if v_new_balance < 0 then
      raise exception 'payment application overpays invoice % by %', v_invoice.invoice_number, -v_new_balance;
    end if;

    insert into payment_applications (payment_id, invoice_id, amount_applied)
    values (v_payment_id, v_invoice.id, v_app_amount);

    update invoices
       set balance_due = v_new_balance,
           status = case when v_new_balance = 0 then 'paid' else 'partial' end
     where id = v_invoice.id;

    v_total_applied := v_total_applied + v_app_amount;
  end loop;

  if v_total_applied > v_amount then
    raise exception 'payment applications (%) exceed the payment amount (%)', v_total_applied, v_amount;
  end if;

  update payments_received set unapplied_amount = v_amount - v_total_applied where id = v_payment_id;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, p_payment_date, 'Payment received', 'payment_received', v_payment_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_cash_account_id, v_amount, 0);

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_ar_account_id, 0, v_amount);

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Customer credit: apply to open invoices / pay back
-- ---------------------------------------------------------------------------
-- Applies every unused credit of one customer to their open invoices and debit
-- notes, oldest due first, oldest credit first. No GL entry: the credit and the
-- invoice are both already in AR. Returns the amount applied.
create or replace function public.apply_customer_credit(p_tenant_id uuid, p_contact_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_credit record;
  v_need numeric;
  v_take numeric;
  v_total numeric := 0;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if not exists (select 1 from contacts where id = p_contact_id and tenant_id = p_tenant_id) then
    raise exception 'customer % does not belong to this workspace', p_contact_id;
  end if;

  for v_invoice in
    select id, balance_due
      from invoices
     where tenant_id = p_tenant_id and contact_id = p_contact_id
       and document_type in ('invoice', 'debit_note')
       and status in ('sent', 'partial', 'overdue')
       and balance_due > 0
     order by due_date nulls last, issue_date, invoice_number
       for update
  loop
    v_need := v_invoice.balance_due;

    for v_credit in
      select id, unapplied_amount
        from payments_received
       where tenant_id = p_tenant_id and contact_id = p_contact_id and unapplied_amount > 0
       order by payment_date, created_at
         for update
    loop
      exit when v_need <= 0;
      v_take := least(v_need, v_credit.unapplied_amount);

      insert into payment_applications (payment_id, invoice_id, amount_applied)
      values (v_credit.id, v_invoice.id, v_take);

      update payments_received set unapplied_amount = unapplied_amount - v_take where id = v_credit.id;

      v_need := v_need - v_take;
      v_total := v_total + v_take;
    end loop;

    if v_need < v_invoice.balance_due then
      update invoices
         set balance_due = v_need,
             status = case when v_need = 0 then 'paid' else 'partial' end
       where id = v_invoice.id;
    end if;

    exit when v_need > 0; -- credits ran out
  end loop;

  return v_total;
end;
$$;

-- Pays a customer's unused credit back to them. Recorded as a refund receipt
-- (refund_source = 'credit') so it has a number, a printable document, and a
-- place in the feed; the credit it consumes is tracked in payment_applications.
--   Dr Accounts Receivable / Cr Cash
create or replace function public.refund_customer_credit(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_refund_date date,
  p_amount numeric,
  p_method text,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_available numeric;
  v_number text;
  v_doc_id uuid;
  v_credit record;
  v_need numeric;
  v_take numeric;
  v_cash_id uuid;
  v_ar_id uuid;
  v_entry_id uuid;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if not exists (select 1 from contacts where id = p_contact_id and tenant_id = p_tenant_id) then
    raise exception 'customer % does not belong to this workspace', p_contact_id;
  end if;

  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'enter a refund amount greater than zero';
  end if;
  if p_refund_date is null then
    raise exception 'a refund date is required';
  end if;
  if coalesce(trim(p_method), '') = '' then
    raise exception 'choose how the refund was paid';
  end if;

  select coalesce(sum(unapplied_amount), 0) into v_available
    from payments_received
   where tenant_id = p_tenant_id and contact_id = p_contact_id and unapplied_amount > 0;

  if v_amount > v_available then
    raise exception 'the refund (%) is more than the customer''s unused credit (%)', v_amount, v_available;
  end if;

  select id into v_cash_id from accounts where tenant_id = p_tenant_id and code = '1000';
  select id into v_ar_id from accounts where tenant_id = p_tenant_id and code = '1010';
  if v_cash_id is null or v_ar_id is null then
    raise exception 'tenant % is missing the standard Cash/AR accounts (codes 1000/1010)', p_tenant_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('vitacount.sales_document_number'), hashtext(p_tenant_id::text));
  v_number := next_document_number(p_tenant_id, 'refund_receipt');

  insert into invoices (
    tenant_id, contact_id, invoice_number, document_type, refund_source, issue_date, status,
    subtotal, tax_total, total, balance_due, payment_method, payment_reference, created_by
  ) values (
    p_tenant_id, p_contact_id, v_number, 'refund_receipt', 'credit', p_refund_date, 'paid',
    v_amount, 0, v_amount, 0, trim(p_method), nullif(trim(p_reference), ''), auth.uid()
  )
  returning id into v_doc_id;

  insert into invoice_lines (invoice_id, description, quantity, unit_price, tax_rate, amount, sort_order)
  values (v_doc_id, 'Refund of unused customer credit', 1, v_amount, 0, v_amount, 0);

  v_need := v_amount;
  for v_credit in
    select id, unapplied_amount
      from payments_received
     where tenant_id = p_tenant_id and contact_id = p_contact_id and unapplied_amount > 0
     order by payment_date, created_at
       for update
  loop
    exit when v_need <= 0;
    v_take := least(v_need, v_credit.unapplied_amount);

    insert into payment_applications (payment_id, invoice_id, amount_applied)
    values (v_credit.id, v_doc_id, v_take);

    update payments_received set unapplied_amount = unapplied_amount - v_take where id = v_credit.id;
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    -- another refund/application consumed the credit between the check and the locks
    raise exception 'the customer''s unused credit changed — reload and try again';
  end if;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, p_refund_date, 'Refund ' || v_number || ' (customer credit)', 'refund_receipt', v_doc_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_ar_id, v_amount, 0, 'Refund ' || v_number),
         (v_entry_id, v_cash_id, 0, v_amount, 'Refund ' || v_number);

  return v_doc_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Supplier credits (vendor credit / debit note to a supplier)
-- ---------------------------------------------------------------------------
-- Mirror image of create_bill_received: Dr Accounts Payable / Cr each line's
-- account. balance_due tracks how much of the credit is still unused.
create or replace function public.create_vendor_credit(
  p_tenant_id uuid,
  p_vendor_id uuid,
  p_credit_number text,
  p_issue_date date,
  p_lines jsonb -- [{ "accountId": uuid, "description": text, "quantity": numeric, "unitCost": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit_id uuid;
  v_ap_account_id uuid;
  v_entry_id uuid;
  v_line jsonb;
  v_line_no int := 0;
  v_account_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_amount numeric;
  v_total numeric := 0;
  v_label text;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if not exists (select 1 from contacts where id = p_vendor_id and tenant_id = p_tenant_id) then
    raise exception 'supplier % does not belong to this workspace', p_vendor_id;
  end if;
  if p_issue_date is null then
    raise exception 'a date is required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'add at least one line item';
  end if;

  select id into v_ap_account_id from accounts where tenant_id = p_tenant_id and code = '2000';
  if v_ap_account_id is null then
    raise exception 'tenant % is missing the standard Accounts Payable account (code 2000)', p_tenant_id;
  end if;

  insert into bills (tenant_id, vendor_id, bill_number, issue_date, due_date, status, document_type, created_by)
  values (p_tenant_id, p_vendor_id, nullif(trim(p_credit_number), ''), p_issue_date, null, 'open', 'vendor_credit', auth.uid())
  returning id into v_credit_id;

  v_label := 'Supplier credit ' || coalesce(nullif(trim(p_credit_number), ''), left(v_credit_id::text, 8));

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, p_issue_date, v_label, 'vendor_credit', v_credit_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    v_account_id := (v_line->>'accountId')::uuid;
    v_qty := round(coalesce((v_line->>'quantity')::numeric, 1), 2);
    v_cost := round((v_line->>'unitCost')::numeric, 2);

    if v_account_id is null or not exists (
      select 1 from accounts where id = v_account_id and tenant_id = p_tenant_id
    ) then
      raise exception 'line % needs a category from this workspace', v_line_no;
    end if;
    if v_qty <= 0 then
      raise exception 'line % needs a quantity above zero', v_line_no;
    end if;
    if v_cost is null or v_cost < 0 then
      raise exception 'line % needs an amount of zero or more', v_line_no;
    end if;

    v_amount := round(v_qty * v_cost, 2);

    insert into bill_lines (bill_id, account_id, description, quantity, unit_cost, amount, sort_order)
    values (v_credit_id, v_account_id, nullif(trim(v_line->>'description'), ''), v_qty, v_cost, v_amount, v_line_no - 1);

    if v_amount > 0 then
      insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
      values (v_entry_id, v_account_id, 0, v_amount, nullif(trim(v_line->>'description'), ''));
    end if;

    v_total := v_total + v_amount;
  end loop;

  if v_total <= 0 then
    raise exception 'the total must be more than zero';
  end if;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
  values (v_entry_id, v_ap_account_id, v_total, 0, v_label);

  update bills set total = v_total, balance_due = v_total where id = v_credit_id;

  return v_credit_id;
end;
$$;

-- Applies every unused credit from one supplier to their open bills, oldest due
-- first. No GL entry (AP against AP). Returns the amount applied.
create or replace function public.apply_vendor_credits(p_tenant_id uuid, p_vendor_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill record;
  v_credit record;
  v_need numeric;
  v_take numeric;
  v_total numeric := 0;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if not exists (select 1 from contacts where id = p_vendor_id and tenant_id = p_tenant_id) then
    raise exception 'supplier % does not belong to this workspace', p_vendor_id;
  end if;

  for v_bill in
    select id, balance_due
      from bills
     where tenant_id = p_tenant_id and vendor_id = p_vendor_id
       and document_type = 'bill'
       and status in ('open', 'partial')
       and balance_due > 0
     order by due_date nulls last, issue_date, created_at
       for update
  loop
    v_need := v_bill.balance_due;

    for v_credit in
      select id, balance_due
        from bills
       where tenant_id = p_tenant_id and vendor_id = p_vendor_id
         and document_type = 'vendor_credit'
         and balance_due > 0
       order by issue_date, created_at
         for update
    loop
      exit when v_need <= 0;
      v_take := least(v_need, v_credit.balance_due);

      insert into vendor_credit_applications (tenant_id, vendor_credit_id, bill_id, amount_applied, created_by)
      values (p_tenant_id, v_credit.id, v_bill.id, v_take, auth.uid());

      update bills
         set balance_due = balance_due - v_take,
             status = case when balance_due - v_take = 0 then 'paid' else 'partial' end
       where id = v_credit.id;

      v_need := v_need - v_take;
      v_total := v_total + v_take;
    end loop;

    if v_need < v_bill.balance_due then
      update bills
         set balance_due = v_need,
             status = case when v_need = 0 then 'paid' else 'partial' end
       where id = v_bill.id;
    end if;

    exit when v_need > 0; -- credits ran out
  end loop;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. pay_vendor_bills — one payment (check / transfer) across several bills
-- ---------------------------------------------------------------------------
-- Immediate payments only (scheduling stays on post_vendor_payment_made). Unlike
-- _apply_vendor_payment, the GL entry is dated on the payment date, so a
-- back-dated check lands in the right period.
create or replace function public.pay_vendor_bills(
  p_tenant_id uuid,
  p_vendor_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_applications jsonb -- [{ "billId": uuid, "amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_payment_id uuid;
  v_ap_account_id uuid;
  v_cash_account_id uuid;
  v_entry_id uuid;
  v_app jsonb;
  v_app_amount numeric;
  v_bill bills%rowtype;
  v_new_balance numeric;
  v_total_applied numeric := 0;
begin
  if not exists (
    select 1 from memberships
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not authorized for this tenant';
  end if;

  if not exists (select 1 from contacts where id = p_vendor_id and tenant_id = p_tenant_id) then
    raise exception 'supplier % does not belong to this workspace', p_vendor_id;
  end if;

  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'enter a payment amount greater than zero';
  end if;
  if p_payment_date is null then
    raise exception 'a payment date is required';
  end if;
  if p_applications is null or jsonb_typeof(p_applications) <> 'array' or jsonb_array_length(p_applications) = 0 then
    raise exception 'a payment must be applied to at least one bill';
  end if;

  select id into v_ap_account_id from accounts where tenant_id = p_tenant_id and code = '2000';
  select id into v_cash_account_id from accounts where tenant_id = p_tenant_id and code = '1000';
  if v_ap_account_id is null or v_cash_account_id is null then
    raise exception 'tenant % is missing the standard AP/Cash accounts (codes 2000/1000)', p_tenant_id;
  end if;

  insert into payments_made (tenant_id, vendor_id, payment_date, amount, method, reference, created_by)
  values (p_tenant_id, p_vendor_id, p_payment_date, v_amount, p_method, nullif(trim(p_reference), ''), auth.uid())
  returning id into v_payment_id;

  for v_app in select * from jsonb_array_elements(p_applications)
  loop
    v_app_amount := round((v_app->>'amount')::numeric, 2);
    if v_app_amount is null or v_app_amount <= 0 then
      raise exception 'each amount applied to a bill must be more than zero';
    end if;

    select * into v_bill
      from bills
     where id = (v_app->>'billId')::uuid and tenant_id = p_tenant_id
       for update;

    if not found then
      raise exception 'bill % does not belong to tenant %', (v_app->>'billId'), p_tenant_id;
    end if;
    if v_bill.vendor_id <> p_vendor_id then
      raise exception 'bill % belongs to a different supplier', coalesce(v_bill.bill_number, v_bill.id::text);
    end if;
    if v_bill.document_type <> 'bill' or v_bill.status not in ('open', 'partial') then
      raise exception 'bill % is not open for payment (status %)', coalesce(v_bill.bill_number, v_bill.id::text), v_bill.status;
    end if;

    v_new_balance := v_bill.balance_due - v_app_amount;
    if v_new_balance < 0 then
      raise exception 'payment application overpays bill % by %', coalesce(v_bill.bill_number, v_bill.id::text), -v_new_balance;
    end if;

    insert into bill_payment_applications (payment_id, bill_id, amount_applied)
    values (v_payment_id, v_bill.id, v_app_amount);

    update bills
       set balance_due = v_new_balance,
           status = case when v_new_balance = 0 then 'paid' else 'partial' end
     where id = v_bill.id;

    v_total_applied := v_total_applied + v_app_amount;
  end loop;

  if v_total_applied <> v_amount then
    raise exception 'payment applications (%) must sum to the payment amount (%)', v_total_applied, v_amount;
  end if;

  insert into journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  values (p_tenant_id, p_payment_date, 'Vendor payment made', 'payment_made', v_payment_id, 'posted', now(), auth.uid())
  returning id into v_entry_id;

  insert into journal_entry_lines (journal_entry_id, account_id, debit, credit)
  values (v_entry_id, v_ap_account_id, v_amount, 0),
         (v_entry_id, v_cash_account_id, 0, v_amount);

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Unified feed: document types, correct sign for refunds and supplier credits
-- ---------------------------------------------------------------------------
create or replace view public.unified_transactions_feed
with (security_invoker = true)
as
select
  i.document_type as transaction_type,
  i.id as id,
  i.tenant_id as tenant_id,
  c.display_name as party_name,
  case when i.document_type = 'refund_receipt' then -i.total else i.total end as amount,
  i.issue_date as transaction_date,
  i.status as status,
  case i.document_type
    when 'sales_receipt' then 'Sales receipt #'
    when 'refund_receipt' then 'Refund #'
    when 'debit_note' then 'Debit note #'
    else 'Invoice #'
  end || i.invoice_number as description,
  i.created_at as created_at
from public.invoices i
left join public.contacts c on c.id = i.contact_id

union all

select
  b.document_type as transaction_type,
  b.id as id,
  b.tenant_id as tenant_id,
  c.display_name as party_name,
  case when b.document_type = 'vendor_credit' then b.total else -b.total end as amount,
  b.issue_date as transaction_date,
  b.status as status,
  case when b.document_type = 'vendor_credit' then 'Supplier credit' else 'Bill' end
    || coalesce(' #' || b.bill_number, '') as description,
  b.created_at as created_at
from public.bills b
left join public.contacts c on c.id = b.vendor_id

union all

select
  'expense' as transaction_type,
  e.id as id,
  e.tenant_id as tenant_id,
  c.display_name as party_name,
  -e.amount as amount,
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
  pr.amount as amount,
  pr.payment_date as transaction_date,
  'posted' as status,
  'Customer Payment Received' || coalesce(' (' || pr.method || ')', '') as description,
  pr.created_at as created_at
from public.payments_received pr
left join public.contacts c on c.id = pr.contact_id

union all

select
  'payment_made' as transaction_type,
  pm.id as id,
  pm.tenant_id as tenant_id,
  c.display_name as party_name,
  -pm.amount as amount,
  pm.payment_date as transaction_date,
  'posted' as status,
  'Vendor Payment Made' || coalesce(' (' || pm.method || ')', '') as description,
  pm.created_at as created_at
from public.payments_made pm
left join public.contacts c on c.id = pm.vendor_id;

-- ---------------------------------------------------------------------------
-- 13. Grants — same lockdown pattern as ar_ap_lockdown_function_grants
-- ---------------------------------------------------------------------------
revoke execute on function public.next_document_number(uuid, text) from public, anon;
revoke execute on function public.create_sales_document(uuid, uuid, text, date, date, text, text, jsonb) from public, anon;
revoke execute on function public.apply_customer_credit(uuid, uuid) from public, anon;
revoke execute on function public.refund_customer_credit(uuid, uuid, date, numeric, text, text) from public, anon;
revoke execute on function public.create_vendor_credit(uuid, uuid, text, date, jsonb) from public, anon;
revoke execute on function public.apply_vendor_credits(uuid, uuid) from public, anon;
revoke execute on function public.pay_vendor_bills(uuid, uuid, date, numeric, text, text, jsonb) from public, anon;

grant execute on function public.next_document_number(uuid, text) to authenticated;
grant execute on function public.create_sales_document(uuid, uuid, text, date, date, text, text, jsonb) to authenticated;
grant execute on function public.apply_customer_credit(uuid, uuid) to authenticated;
grant execute on function public.refund_customer_credit(uuid, uuid, date, numeric, text, text) to authenticated;
grant execute on function public.create_vendor_credit(uuid, uuid, text, date, jsonb) to authenticated;
grant execute on function public.apply_vendor_credits(uuid, uuid) to authenticated;
grant execute on function public.pay_vendor_bills(uuid, uuid, date, numeric, text, text, jsonb) to authenticated;

-- PostgREST caches the schema; new columns/functions are invisible to the API until reloaded.
notify pgrst, 'reload schema';

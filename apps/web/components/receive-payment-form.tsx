"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyCustomerCreditAction, receivePaymentAction, type ReceivePaymentState } from "@/lib/actions/invoices";
import { formatDate, todayISO } from "@/lib/dates";
import { PAYMENT_METHODS } from "@/lib/documents";
import { formatMoney, normalizeAmount, toScaled } from "@/lib/money";

export type OpenReceivable = {
  id: string;
  number: string;
  documentType: string;
  contactId: string;
  issueDate: string;
  dueDate: string | null;
  total: number;
  balanceDue: number;
};

export type PayingCustomer = { id: string; name: string; openBalance: number; credit: number };

const initialState: ReceivePaymentState = { error: null };
const selectClass = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";

const cents = (text: string) => toScaled(text, 2) ?? BigInt(0);
const centsToText = (value: bigint) => (Number(value) / 100).toFixed(2);

/** Spread `amount` over invoices in order (oldest due first), never past an open balance. */
function distributeOldestFirst(amount: string, invoices: OpenReceivable[]): Record<string, string> {
  let remaining = cents(amount);
  const result: Record<string, string> = {};
  for (const inv of invoices) {
    if (remaining <= BigInt(0)) break;
    const balance = cents(inv.balanceDue.toFixed(2));
    const take = remaining < balance ? remaining : balance;
    result[inv.id] = centsToText(take);
    remaining -= take;
  }
  return result;
}

export function ReceivePaymentForm({
  tenantId,
  customers,
  openInvoices,
  defaultCustomerId,
  focusInvoiceId,
}: {
  tenantId: string;
  customers: PayingCustomer[];
  openInvoices: OpenReceivable[];
  defaultCustomerId?: string;
  focusInvoiceId?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(receivePaymentAction.bind(null, tenantId), initialState);
  const [crediting, startCrediting] = useTransition();
  const [creditMessage, setCreditMessage] = useState<string | null>(null);

  const focused = openInvoices.find((i) => i.id === focusInvoiceId && (!defaultCustomerId || i.contactId === defaultCustomerId));

  const [contactId, setContactId] = useState(defaultCustomerId ?? focused?.contactId ?? "");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  // When `auto`, allocations follow the amount (oldest due first). Editing any row switches to manual.
  const [auto, setAuto] = useState(!focused);
  const [amount, setAmount] = useState(focused ? focused.balanceDue.toFixed(2) : "");
  const [amountTouched, setAmountTouched] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>(focused ? { [focused.id]: focused.balanceDue.toFixed(2) } : {});

  const customer = customers.find((c) => c.id === contactId) ?? null;
  const invoices = useMemo(
    () =>
      openInvoices
        .filter((i) => i.contactId === contactId)
        .sort(
          (a, b) =>
            (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
            a.issueDate.localeCompare(b.issueDate) ||
            a.number.localeCompare(b.number),
        ),
    [openInvoices, contactId],
  );

  const allocations = auto ? distributeOldestFirst(amount, invoices) : manual;
  const receivedCents = cents(amount);
  const appliedCents = invoices.reduce((sum, inv) => sum + cents(allocations[inv.id] ?? ""), BigInt(0));
  const leftoverCents = receivedCents - appliedCents;
  const rowErrors = new Set(
    invoices.filter((inv) => cents(allocations[inv.id] ?? "") > cents(inv.balanceDue.toFixed(2))).map((inv) => inv.id),
  );
  const invalidAmounts = invoices.some((inv) => allocations[inv.id] && normalizeAmount(allocations[inv.id]) === null);
  const today = todayISO();

  function selectCustomer(id: string) {
    setContactId(id);
    setManual({});
    setAuto(true);
    setCreditMessage(null);
  }

  function editAllocation(invoiceId: string, value: string | null) {
    const next = { ...allocations };
    if (value === null || value === "") delete next[invoiceId];
    else next[invoiceId] = value;
    setManual(next);
    setAuto(false);
    if (!amountTouched) {
      const sum = Object.values(next).reduce((s, v) => s + cents(v), BigInt(0));
      setAmount(sum > BigInt(0) ? centsToText(sum) : "");
    }
  }

  function toggle(inv: OpenReceivable, checked: boolean) {
    if (!checked) return editAllocation(inv.id, null);
    const balance = cents(inv.balanceDue.toFixed(2));
    const remaining = receivedCents - appliedCents;
    const take = amountTouched && remaining > BigInt(0) && remaining < balance ? remaining : balance;
    editAllocation(inv.id, centsToText(take));
  }

  function applyCredit() {
    if (!customer) return;
    startCrediting(async () => {
      setCreditMessage(null);
      const result = await applyCustomerCreditAction(tenantId, customer.id);
      setCreditMessage(result.error ?? `Applied ${formatMoney(result.applied)} of credit to open invoices.`);
      router.refresh();
    });
  }

  const applicationsJson = JSON.stringify(
    invoices
      .filter((inv) => cents(allocations[inv.id] ?? "") > BigInt(0))
      .map((inv) => ({ invoiceId: inv.id, amount: allocations[inv.id] })),
  );

  const problem = !contactId
    ? null
    : invalidAmounts
      ? "One of the payment amounts isn't a valid number."
      : rowErrors.size > 0
        ? "A payment is more than that invoice's open balance."
        : leftoverCents < BigInt(0)
          ? `You've applied ${formatMoney(Number(-leftoverCents) / 100)} more than the amount received.`
          : null;
  // Empty required fields (customer, amount, method) are left to the browser's own
  // validation so it points at the field; only problems it can't see disable the button.
  const canSubmit = problem === null && !pending;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="applications" value={applicationsJson} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="contactId">Customer</Label>
          <select id="contactId" name="contactId" required value={contactId} onChange={(e) => selectCustomer(e.target.value)} className={selectClass}>
            <option value="">Who paid you?</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.openBalance > 0 ? ` — ${formatMoney(c.openBalance)} open` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="paymentDate">Payment date</Label>
          <Input id="paymentDate" name="paymentDate" type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount received</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountTouched(e.target.value !== "");
            }}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="method">Payment method</Label>
          <select id="method" name="method" required value={method} onChange={(e) => setMethod(e.target.value)} className={selectClass}>
            <option value="">Choose…</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="reference">Reference (optional)</Label>
          <Input id="reference" name="reference" placeholder="Check #, transfer ID…" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      {customer && customer.credit > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-chart-2/10 px-4 py-3 text-sm">
          <p className="flex-1 text-foreground">
            <span className="font-semibold">{customer.name}</span> has <span className="font-semibold">{formatMoney(customer.credit)}</span> of unused
            credit from earlier payments.
          </p>
          {invoices.length > 0 ? (
            <Button type="button" variant="outline" className="rounded-full" disabled={crediting} onClick={applyCredit}>
              {crediting ? "Applying…" : "Apply credit to open invoices"}
            </Button>
          ) : (
            <Link href={`/sales/new?type=refund_receipt&source=credit&customer=${customer.id}`} className="text-sm font-medium text-primary hover:underline">
              Refund it instead →
            </Link>
          )}
          {creditMessage && <p className="w-full text-xs text-muted-foreground">{creditMessage}</p>}
        </div>
      )}

      {contactId && (
        <div className="rounded-xl border border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
            <p className="text-sm font-medium text-foreground">Open invoices</p>
            {invoices.length > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setAuto(true)}
                  disabled={auto || receivedCents === BigInt(0)}
                  className="cursor-pointer font-medium text-primary hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
                >
                  {auto ? "Applied oldest due first" : "Re-apply oldest due first"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManual({});
                    setAuto(false);
                    if (!amountTouched) setAmount("");
                  }}
                  className="cursor-pointer font-medium text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {invoices.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              {customer?.name ?? "This customer"} has no open invoices. Anything you record now is saved as credit you can apply later or refund.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-muted-foreground">
                    <th className="w-10 px-4 py-2" aria-label="Include" />
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Due</th>
                    <th className="py-2 pr-4 text-right font-medium">Open balance</th>
                    <th className="w-36 py-2 pr-4 text-right font-medium">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const value = allocations[inv.id] ?? "";
                    const included = cents(value) > BigInt(0);
                    const overdue = inv.dueDate !== null && inv.dueDate < today;
                    return (
                      <tr key={inv.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={(e) => toggle(inv, e.target.checked)}
                            aria-label={`Apply payment to ${inv.number}`}
                            className="size-4 accent-primary"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Link href={`/sales/${inv.id}`} target="_blank" className="font-medium text-primary hover:underline">
                            {inv.number}
                          </Link>
                          {inv.documentType === "debit_note" && (
                            <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Debit note</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                        <td className={`py-2 pr-4 ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                          {inv.dueDate ? formatDate(inv.dueDate) : "No due date"}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(inv.balanceDue)}</td>
                        <td className="py-2 pr-4">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            aria-label={`Payment for ${inv.number}`}
                            aria-invalid={rowErrors.has(inv.id) || undefined}
                            placeholder="0.00"
                            value={value}
                            onChange={(e) => editAllocation(inv.id, e.target.value)}
                            className="text-right tabular-nums"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {contactId && (
        <dl className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 rounded-xl bg-muted/40 px-4 py-3 text-sm tabular-nums">
          <dt className="text-muted-foreground">Amount received</dt>
          <dd className="text-right font-medium">{formatMoney(Number(receivedCents) / 100)}</dd>
          <dt className="text-muted-foreground">Applied to invoices</dt>
          <dd className="text-right font-medium">{formatMoney(Number(appliedCents) / 100)}</dd>
          {leftoverCents > BigInt(0) && (
            <>
              <dt className="border-t border-border/70 pt-1.5 text-foreground">Kept as customer credit</dt>
              <dd className="border-t border-border/70 pt-1.5 text-right font-semibold text-foreground">
                {formatMoney(Number(leftoverCents) / 100)}
              </dd>
              <dd className="col-span-2 text-xs text-muted-foreground">
                The extra stays on {customer?.name ?? "the customer"}&apos;s account — apply it to a future invoice or refund it.
              </dd>
            </>
          )}
          {leftoverCents === BigInt(0) && receivedCents > BigInt(0) && (
            <dd className="col-span-2 border-t border-border/70 pt-1.5 text-xs text-positive">Fully applied.</dd>
          )}
        </dl>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {problem && (
          <p className="mr-auto text-sm text-destructive" role="alert">
            {problem}
          </p>
        )}
        <Button type="submit" disabled={!canSubmit} className="rounded-full">
          {pending ? "Recording…" : "Record payment"}
        </Button>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

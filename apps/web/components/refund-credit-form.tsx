"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refundCustomerCreditAction, type RefundCreditState } from "@/lib/actions/invoices";
import { todayISO } from "@/lib/dates";
import { PAYMENT_METHODS } from "@/lib/documents";
import { formatMoney } from "@/lib/money";

const initialState: RefundCreditState = { error: null };
const selectClass = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";

export type CustomerCredit = { id: string; name: string; credit: number };

/** Pays back a customer's unused credit (e.g. an overpayment). Dr Accounts Receivable / Cr Cash. */
export function RefundCreditForm({
  tenantId,
  customers,
  defaultCustomerId,
}: {
  tenantId: string;
  customers: CustomerCredit[];
  defaultCustomerId?: string;
}) {
  const [state, formAction, pending] = useActionState(refundCustomerCreditAction.bind(null, tenantId), initialState);
  const initial = customers.find((c) => c.id === defaultCustomerId) ?? customers[0];
  const [contactId, setContactId] = useState(initial?.id ?? "");
  const [amount, setAmount] = useState(initial ? initial.credit.toFixed(2) : "");
  const selected = customers.find((c) => c.id === contactId);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="creditContactId">Customer</Label>
          <select
            id="creditContactId"
            name="contactId"
            required
            value={contactId}
            onChange={(e) => {
              setContactId(e.target.value);
              const c = customers.find((x) => x.id === e.target.value);
              setAmount(c ? c.credit.toFixed(2) : "");
            }}
            className={selectClass}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {formatMoney(c.credit)} available
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="refundDate">Refund date</Label>
          <Input id="refundDate" name="refundDate" type="date" required defaultValue={todayISO()} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="creditAmount">Amount to refund</Label>
          <Input
            id="creditAmount"
            name="amount"
            type="number"
            min="0.01"
            max={selected ? selected.credit.toFixed(2) : undefined}
            step="0.01"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="creditMethod">Refunded by</Label>
          <select id="creditMethod" name="method" required defaultValue="" className={selectClass}>
            <option value="">Choose…</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="creditReference">Reference (optional)</Label>
          <Input id="creditReference" name="reference" placeholder="Check #, transfer ID…" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={pending || !contactId} className="rounded-full">
          {pending ? "Saving…" : "Refund credit"}
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

/** Lets the Refund page switch between refunding a sale and refunding unused credit. */
export function RefundModeSwitch({
  defaultMode,
  saleForm,
  creditForm,
}: {
  defaultMode: "sale" | "credit";
  saleForm: React.ReactNode;
  creditForm: React.ReactNode;
}) {
  const [mode, setMode] = useState(defaultMode);
  const options = [
    { value: "sale" as const, label: "Returned items or services", hint: "Reverses the sale and the tax on it." },
    { value: "credit" as const, label: "A customer's unused credit", hint: "Pays back money left over from an overpayment." },
  ];

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-sm font-medium text-foreground">What are you refunding?</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-150 ${
                mode === o.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60"
              }`}
            >
              <input
                type="radio"
                name="refundMode"
                value={o.value}
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "sale" ? saleForm : creditForm}
    </div>
  );
}

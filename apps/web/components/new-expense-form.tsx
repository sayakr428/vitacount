"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createExpenseAction, type CreateExpenseState } from "@/lib/actions/bills";
import { todayISO } from "@/lib/dates";
import { PAYMENT_METHODS } from "@/lib/documents";

type Vendor = { id: string; display_name: string };
type Account = { id: string; code: string; name: string };

const initialState: CreateExpenseState = { error: null };
const selectClass = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function NewExpenseForm({
  tenantId,
  vendors,
  expenseAccounts,
}: {
  tenantId: string;
  vendors: Vendor[];
  expenseAccounts: Account[];
}) {
  const [state, formAction, pending] = useActionState(createExpenseAction.bind(null, tenantId), initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="vendorId">Paid to (optional)</Label>
          <select id="vendorId" name="vendorId" defaultValue="" className={selectClass}>
            <option value="">No supplier</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expenseDate">Date paid</Label>
          <Input id="expenseDate" name="expenseDate" type="date" required defaultValue={todayISO()} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="accountId">Category</Label>
          <select id="accountId" name="accountId" required defaultValue="" className={selectClass}>
            <option value="">Choose a category…</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required placeholder="0.00" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="method">Paid by</Label>
          <select id="method" name="method" required defaultValue="" className={selectClass}>
            <option value="">Choose…</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="memo">What was it for?</Label>
          <Input id="memo" name="memo" placeholder="e.g. Printer paper and toner" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        <Button type="submit" disabled={pending} className="rounded-full">
          {pending ? "Saving…" : "Record expense"}
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

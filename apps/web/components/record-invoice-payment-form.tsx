"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  recordInvoicePaymentAction,
  type RecordPaymentState,
} from "@/lib/actions/invoices";

const initialState: RecordPaymentState = { error: null };

export function RecordInvoicePaymentForm({
  tenantId,
  contactId,
  invoiceId,
  balanceDue,
}: {
  tenantId: string;
  contactId: string;
  invoiceId: string;
  balanceDue: number;
}) {
  const [state, formAction, pending] = useActionState(
    recordInvoicePaymentAction.bind(null, tenantId, contactId, invoiceId),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="paymentDate">Date</Label>
        <Input id="paymentDate" name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Amount</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required defaultValue={balanceDue.toFixed(2)} className="w-32" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="method">Method</Label>
        <select id="method" name="method" defaultValue="cash" className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reference">Reference</Label>
        <Input id="reference" name="reference" placeholder="Check #, etc." className="w-40" />
      </div>
      <Button type="submit" disabled={pending} className="rounded-full">
        {pending ? "Recording…" : "Record payment"}
      </Button>
      {state.error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

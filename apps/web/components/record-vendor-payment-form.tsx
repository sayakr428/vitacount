"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  recordVendorPaymentAction,
  type RecordVendorPaymentState,
} from "@/lib/actions/vendor-payments";
import { todayISO } from "@/lib/dates";
import { PAYMENT_METHODS } from "@/lib/documents";

const initialState: RecordVendorPaymentState = { error: null };

export function RecordVendorPaymentForm({
  tenantId,
  vendorId,
  billId,
  balanceDue,
}: {
  tenantId: string;
  vendorId: string;
  billId: string;
  balanceDue: number;
}) {
  const [state, formAction, pending] = useActionState(
    recordVendorPaymentAction.bind(null, tenantId, vendorId, billId),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="paymentDate">Date</Label>
        <Input id="paymentDate" name="paymentDate" type="date" required defaultValue={todayISO()} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Amount</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required defaultValue={balanceDue.toFixed(2)} className="w-32" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="method">Method</Label>
        <select id="method" name="method" defaultValue="bank_transfer" className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reference">Reference</Label>
        <Input id="reference" name="reference" placeholder="Check #, etc." className="w-36" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="scheduledFor">Schedule for (optional)</Label>
        <Input id="scheduledFor" name="scheduledFor" type="date" className="w-40" />
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

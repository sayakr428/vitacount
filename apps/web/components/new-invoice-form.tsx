"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInvoiceAction, type CreateInvoiceState } from "@/lib/actions/invoices";

type Contact = { id: string; display_name: string };

type LineRow = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

function emptyRow(defaultTaxRate: number): LineRow {
  return { description: "", quantity: "1", unitPrice: "", taxRate: String(defaultTaxRate) };
}

const initialState: CreateInvoiceState = { error: null };

export function NewInvoiceForm({
  tenantId,
  contacts,
  defaultTaxRate,
}: {
  tenantId: string;
  contacts: Contact[];
  defaultTaxRate: number;
}) {
  const [rows, setRows] = useState<LineRow[]>([emptyRow(defaultTaxRate)]);
  const [state, formAction, pending] = useActionState(
    createInvoiceAction.bind(null, tenantId),
    initialState,
  );

  const { subtotal, taxTotal, total } = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const qty = Number(row.quantity) || 0;
        const price = Number(row.unitPrice) || 0;
        const rate = Number(row.taxRate) || 0;
        const amount = qty * price;
        return {
          subtotal: acc.subtotal + amount,
          taxTotal: acc.taxTotal + amount * rate,
          total: acc.total + amount + amount * rate,
        };
      },
      { subtotal: 0, taxTotal: 0, total: 0 },
    );
  }, [rows]);

  function updateRow(index: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const linesJson = JSON.stringify(
    rows
      .filter((r) => r.description && Number(r.quantity) > 0)
      .map((r) => ({
        description: r.description,
        quantity: Number(r.quantity) || 0,
        unitPrice: Number(r.unitPrice) || 0,
        taxRate: Number(r.taxRate) || 0,
      })),
  );

  const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="lines" value={linesJson} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contactId">Customer</Label>
          <select
            id="contactId"
            name="contactId"
            required
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">Select customer…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="issueDate">Issue date</Label>
          <Input id="issueDate" name="issueDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" name="dueDate" type="date" required />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium">Description</th>
              <th className="w-20 pb-2 font-medium">Qty</th>
              <th className="w-28 pb-2 font-medium">Unit price</th>
              <th className="w-24 pb-2 font-medium">Tax %</th>
              <th className="w-28 pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <Input value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input type="number" min="0" step="1" value={row.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input type="number" min="0" step="0.01" value={row.unitPrice} onChange={(e) => updateRow(i, { unitPrice: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={row.taxRate}
                    onChange={(e) => updateRow(i, { taxRate: e.target.value })}
                  />
                </td>
                <td className="py-1 text-right tabular-nums">
                  {currency((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-fit rounded-full"
        onClick={() => setRows((prev) => [...prev, emptyRow(defaultTaxRate)])}
      >
        + Add line
      </Button>

      <div className="flex flex-col items-end gap-1 border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Subtotal {currency(subtotal)}</span>
        <span className="text-muted-foreground">Tax {currency(taxTotal)}</span>
        <span className="font-heading text-base font-semibold">Total {currency(total)}</span>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={pending} className="rounded-full">
          {pending ? "Saving…" : "Save draft"}
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

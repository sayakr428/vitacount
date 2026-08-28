"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBillAction, type CreateBillState } from "@/lib/actions/bills";

type Vendor = { id: string; display_name: string };
type Account = { id: string; code: string; name: string };

type LineRow = {
  accountId: string;
  description: string;
  quantity: string;
  unitCost: string;
};

const EMPTY_ROW: LineRow = { accountId: "", description: "", quantity: "1", unitCost: "" };
const initialState: CreateBillState = { error: null };

export function NewBillForm({
  tenantId,
  vendors,
  expenseAccounts,
}: {
  tenantId: string;
  vendors: Vendor[];
  expenseAccounts: Account[];
}) {
  const [rows, setRows] = useState<LineRow[]>([{ ...EMPTY_ROW }]);
  const [state, formAction, pending] = useActionState(
    createBillAction.bind(null, tenantId),
    initialState,
  );

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unitCost) || 0), 0),
    [rows],
  );

  function updateRow(index: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const linesJson = JSON.stringify(
    rows
      .filter((r) => r.accountId && Number(r.quantity) > 0)
      .map((r) => ({
        accountId: r.accountId,
        description: r.description,
        quantity: Number(r.quantity) || 0,
        unitCost: Number(r.unitCost) || 0,
      })),
  );

  const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="lines" value={linesJson} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="vendorId">Vendor</Label>
          <select
            id="vendorId"
            name="vendorId"
            required
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billNumber">Bill #</Label>
          <Input id="billNumber" name="billNumber" placeholder="Vendor's ref" />
        </div>
        <div />
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
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 font-medium">Description</th>
              <th className="w-20 pb-2 font-medium">Qty</th>
              <th className="w-28 pb-2 font-medium">Unit cost</th>
              <th className="w-28 pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <select
                    value={row.accountId}
                    onChange={(e) => updateRow(i, { accountId: e.target.value })}
                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="">Category…</option>
                    {expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <Input value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input type="number" min="0" step="1" value={row.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input type="number" min="0" step="0.01" value={row.unitCost} onChange={(e) => updateRow(i, { unitCost: e.target.value })} />
                </td>
                <td className="py-1 text-right tabular-nums">
                  {currency((Number(row.quantity) || 0) * (Number(row.unitCost) || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" className="w-fit rounded-full" onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}>
        + Add line
      </Button>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="font-heading text-base font-semibold">Total {currency(total)}</span>
        <Button type="submit" disabled={pending} className="rounded-full">
          {pending ? "Saving…" : "Record bill"}
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

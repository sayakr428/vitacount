"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createJournalEntryAction,
  type CreateJournalEntryState,
} from "@/lib/actions/journal-entries";

type Account = { id: string; code: string; name: string };

type LineRow = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
};

const EMPTY_ROW: LineRow = { accountId: "", debit: "", credit: "", memo: "" };
const initialState: CreateJournalEntryState = { error: null };

export function NewJournalEntryForm({
  tenantId,
  accounts,
}: {
  tenantId: string;
  accounts: Account[];
}) {
  const [rows, setRows] = useState<LineRow[]>([{ ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  const [state, formAction, pending] = useActionState(
    createJournalEntryAction.bind(null, tenantId),
    initialState,
  );

  const { totalDebit, totalCredit } = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        totalDebit: acc.totalDebit + (Number(row.debit) || 0),
        totalCredit: acc.totalCredit + (Number(row.credit) || 0),
      }),
      { totalDebit: 0, totalCredit: 0 },
    );
  }, [rows]);

  const balanced =
    totalDebit === totalCredit && totalDebit > 0 && rows.some((r) => r.accountId);

  function updateRow(index: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const linesJson = JSON.stringify(
    rows
      .filter((r) => r.accountId)
      .map((r) => ({
        accountId: r.accountId,
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
        memo: r.memo || undefined,
      })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="lines" value={linesJson} />

      <div className="flex gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="entryDate">Date</Label>
          <Input
            id="entryDate"
            name="entryDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="memo">Memo</Label>
          <Input id="memo" name="memo" />
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-2 font-medium">Account</th>
            <th className="w-28 pb-2 font-medium">Debit</th>
            <th className="w-28 pb-2 font-medium">Credit</th>
            <th className="pb-2 font-medium">Memo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">
                <select
                  value={row.accountId}
                  onChange={(e) => updateRow(i, { accountId: e.target.value })}
                  className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1 pr-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.debit}
                  onChange={(e) =>
                    updateRow(i, { debit: e.target.value, credit: "" })
                  }
                />
              </td>
              <td className="py-1 pr-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.credit}
                  onChange={(e) =>
                    updateRow(i, { credit: e.target.value, debit: "" })
                  }
                />
              </td>
              <td className="py-1">
                <Input
                  value={row.memo}
                  onChange={(e) => updateRow(i, { memo: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
      >
        + Add line
      </Button>

      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className={balanced ? "text-positive" : "text-muted-foreground"}>
          Debit ${totalDebit.toFixed(2)} · Credit ${totalCredit.toFixed(2)}
          {balanced ? " · balanced" : ""}
        </span>
        <Button type="submit" disabled={pending || !balanced}>
          {pending ? "Posting…" : "Post entry"}
        </Button>
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

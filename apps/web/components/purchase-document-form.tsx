"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPurchaseDocumentAction, type CreateBillState } from "@/lib/actions/bills";
import { isISODate, todayISO } from "@/lib/dates";
import {
  PAYMENT_TERMS,
  PURCHASE_DOCUMENTS,
  dueDateForTerms,
  termsChoiceFromDates,
  type PurchaseDocumentType,
  type TermsChoice,
} from "@/lib/documents";
import { computeDocumentTotals, formatMoney } from "@/lib/money";

type Vendor = { id: string; display_name: string };
type Account = { id: string; code: string; name: string };
type LineRow = { key: number; accountId: string; description: string; quantity: string; unitCost: string };

const initialState: CreateBillState = { error: null };
const selectClass = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function PurchaseDocumentForm({
  tenantId,
  documentType,
  vendors,
  expenseAccounts,
  defaultVendorId,
}: {
  tenantId: string;
  documentType: PurchaseDocumentType;
  vendors: Vendor[];
  expenseAccounts: Account[];
  defaultVendorId?: string;
}) {
  const config = PURCHASE_DOCUMENTS[documentType];
  const isBill = documentType === "bill";
  const nextKey = useRef(1);
  const [rows, setRows] = useState<LineRow[]>([{ key: 0, accountId: "", description: "", quantity: "1", unitCost: "" }]);
  const [issueDate, setIssueDate] = useState(todayISO());
  const [terms, setTerms] = useState<TermsChoice>("");
  const [customDays, setCustomDays] = useState("30");
  const [dueDate, setDueDate] = useState("");
  const [state, formAction, pending] = useActionState(createPurchaseDocumentAction.bind(null, tenantId, documentType), initialState);

  const totals = useMemo(() => computeDocumentTotals(rows.map((r) => ({ quantity: r.quantity, unitPrice: r.unitCost }))), [rows]);

  function updateRow(key: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function dueFor(choice: TermsChoice, days: string, issue: string): string {
    if (choice === "" || !isISODate(issue)) return "";
    if (choice === "custom") {
      const n = Number.parseInt(days, 10);
      return Number.isFinite(n) && n >= 0 ? dueDateForTerms(issue, n) : "";
    }
    return dueDateForTerms(issue, PAYMENT_TERMS.find((t) => t.value === choice)!.days);
  }

  function onDueDateChange(value: string) {
    setDueDate(value);
    const { choice, days } = termsChoiceFromDates(issueDate, value);
    if (days !== null && days < 0) {
      setTerms("");
      return;
    }
    setTerms(choice);
    if (choice === "custom" && days !== null) setCustomDays(String(days));
  }

  const dueBeforeIssue = isBill && dueDate !== "" && isISODate(issueDate) && dueDate < issueDate;

  const linesJson = JSON.stringify(
    rows.map((r) => ({ accountId: r.accountId, description: r.description, quantity: r.quantity, unitCost: r.unitCost })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="lines" value={linesJson} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="vendorId">Supplier</Label>
          <select id="vendorId" name="vendorId" required defaultValue={defaultVendorId ?? ""} className={selectClass}>
            <option value="">Select supplier…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reference">{config.referenceLabel}</Label>
          <Input id="reference" name="reference" placeholder="Supplier's ref" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="issueDate">{isBill ? "Bill date" : "Credit date"}</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            required
            value={issueDate}
            onChange={(e) => {
              setIssueDate(e.target.value);
              if (terms !== "") setDueDate(dueFor(terms, customDays, e.target.value));
            }}
          />
        </div>

        {isBill && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="terms">Payment terms</Label>
              <select
                id="terms"
                value={terms}
                onChange={(e) => {
                  const choice = e.target.value as TermsChoice;
                  setTerms(choice);
                  setDueDate(dueFor(choice, customDays, issueDate));
                }}
                className={selectClass}
              >
                <option value="">No terms</option>
                {PAYMENT_TERMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </div>
            {terms === "custom" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="customDays">Net days</Label>
                <Input
                  id="customDays"
                  type="number"
                  min="0"
                  max="999"
                  step="1"
                  inputMode="numeric"
                  value={customDays}
                  onChange={(e) => {
                    setCustomDays(e.target.value);
                    setDueDate(dueFor("custom", e.target.value, issueDate));
                  }}
                />
              </div>
            )}
            <div className={`flex flex-col gap-2 ${terms === "custom" ? "sm:col-span-2" : "sm:col-span-3"}`}>
              <div className="flex items-center justify-between">
                <Label htmlFor="dueDate">Due date</Label>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => onDueDateChange("")}
                    className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                min={isISODate(issueDate) ? issueDate : undefined}
                value={dueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
                aria-invalid={dueBeforeIssue || undefined}
              />
              <p className="text-xs text-muted-foreground">Optional — pick terms, choose a date, or leave it blank.</p>
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 font-medium">Description</th>
              <th className="w-20 pb-2 font-medium">Qty</th>
              <th className="w-28 pb-2 font-medium">Unit cost</th>
              <th className="w-28 pb-2 text-right font-medium">Amount</th>
              <th className="w-8 pb-2" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key}>
                <td className="py-1 pr-2">
                  <select
                    aria-label={`Line ${i + 1} category`}
                    value={row.accountId}
                    onChange={(e) => updateRow(row.key, { accountId: e.target.value })}
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
                  <Input aria-label={`Line ${i + 1} description`} value={row.description} onChange={(e) => updateRow(row.key, { description: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`Line ${i + 1} quantity`}
                    type="number"
                    min="0"
                    step="any"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`Line ${i + 1} unit cost`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => updateRow(row.key, { unitCost: e.target.value })}
                  />
                </td>
                <td className="py-1 text-right tabular-nums">{formatMoney(totals.amounts[i])}</td>
                <td className="py-1 pl-1 text-right">
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    disabled={rows.length === 1}
                    aria-label={`Remove line ${i + 1}`}
                    className="cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5" aria-hidden="true">
                      <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
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
        onClick={() => setRows((prev) => [...prev, { key: nextKey.current++, accountId: "", description: "", quantity: "1", unitCost: "" }])}
      >
        + Add line
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="font-heading text-base font-semibold">
          {isBill ? "Total" : "Credit total"} {formatMoney(totals.subtotal)}
        </span>
        <div className="flex items-center gap-3">
          {dueBeforeIssue && (
            <p className="text-sm text-destructive" role="alert">
              The due date can&apos;t be before the bill date.
            </p>
          )}
          <Button type="submit" disabled={pending || dueBeforeIssue} className="rounded-full">
            {pending ? "Saving…" : config.submitLabel}
          </Button>
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

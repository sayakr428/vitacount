"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PercentInput } from "@/components/percent-input";
import { DocumentPreviewDialog } from "@/components/document-preview";
import { SalesDocumentPaper, type PrintableSalesDocument } from "@/components/sales-document-paper";
import { createSalesDocumentAction, type CreateSalesDocumentState } from "@/lib/actions/invoices";
import { isISODate, todayISO } from "@/lib/dates";
import {
  PAYMENT_METHODS,
  PAYMENT_TERMS,
  SALES_DOCUMENTS,
  dueDateForTerms,
  termsChoiceFromDates,
  type SalesDocumentType,
  type TermsChoice,
} from "@/lib/documents";
import { computeDocumentTotals, formatMoney, parsePercent } from "@/lib/money";

export type FormCustomer = { id: string; display_name: string; email: string | null; addressLines: string[] };

type LineRow = { key: number; description: string; quantity: string; unitPrice: string; taxRate: string };

const initialState: CreateSalesDocumentState = { error: null };
const selectClass = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function SalesDocumentForm({
  tenantId,
  documentType,
  customers,
  defaultTaxRate,
  businessName,
  defaultCustomerId,
}: {
  tenantId: string;
  documentType: SalesDocumentType;
  customers: FormCustomer[];
  /** percent text, e.g. "8.25" */
  defaultTaxRate: string;
  businessName: string;
  defaultCustomerId?: string;
}) {
  const config = SALES_DOCUMENTS[documentType];
  const nextKey = useRef(1);
  const emptyRow = (): LineRow => ({ key: nextKey.current++, description: "", quantity: "1", unitPrice: "", taxRate: defaultTaxRate });

  const [rows, setRows] = useState<LineRow[]>(() => [{ key: 0, description: "", quantity: "1", unitPrice: "", taxRate: defaultTaxRate }]);
  const [contactId, setContactId] = useState(defaultCustomerId ?? "");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [terms, setTerms] = useState<TermsChoice>("");
  const [customDays, setCustomDays] = useState("30");
  const [dueDate, setDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const [state, formAction, pending] = useActionState(createSalesDocumentAction.bind(null, tenantId, documentType), initialState);

  // --- terms <-> due date -------------------------------------------------
  function dueFor(choice: TermsChoice, days: string, issue: string): string {
    if (choice === "" || !isISODate(issue)) return "";
    if (choice === "custom") {
      const n = Number.parseInt(days, 10);
      return Number.isFinite(n) && n >= 0 ? dueDateForTerms(issue, n) : "";
    }
    return dueDateForTerms(issue, PAYMENT_TERMS.find((t) => t.value === choice)!.days);
  }

  function onTermsChange(choice: TermsChoice) {
    setTerms(choice);
    setDueDate(dueFor(choice, customDays, issueDate));
  }

  function onCustomDaysChange(days: string) {
    setCustomDays(days);
    setDueDate(dueFor("custom", days, issueDate));
  }

  function onIssueDateChange(value: string) {
    setIssueDate(value);
    if (terms !== "") setDueDate(dueFor(terms, customDays, value));
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

  // --- lines & totals -----------------------------------------------------
  function updateRow(key: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const totals = useMemo(
    () => computeDocumentTotals(rows.map((r) => ({ quantity: r.quantity, unitPrice: r.unitPrice, taxRate: parsePercent(r.taxRate).ok ? r.taxRate : "0" }))),
    [rows],
  );

  const taxError = rows.some((r) => !parsePercent(r.taxRate).ok);
  const dueBeforeIssue = !config.settlesImmediately && dueDate !== "" && isISODate(issueDate) && dueDate < issueDate;
  const blockingProblem = taxError
    ? "Fix the highlighted tax rate before saving."
    : dueBeforeIssue
      ? `The due date can't be before the ${config.dateLabel.toLowerCase()}.`
      : null;

  const linesJson = JSON.stringify(
    rows.map((r) => ({ description: r.description, quantity: r.quantity, unitPrice: r.unitPrice, taxRate: r.taxRate })),
  );

  // --- preview ------------------------------------------------------------
  const customer = customers.find((c) => c.id === contactId);
  const filled = rows.map((r, i) => ({ r, amount: totals.amounts[i] })).filter(({ r }) => r.description.trim() || r.unitPrice.trim());
  const previewDoc: PrintableSalesDocument = {
    documentType,
    number: null,
    issueDate: isISODate(issueDate) ? issueDate : null,
    dueDate: config.settlesImmediately ? null : dueDate || null,
    customer: {
      name: customer?.display_name ?? "Choose a customer",
      email: customer?.email,
      addressLines: customer?.addressLines,
    },
    lines: filled.map(({ r, amount }) => {
      const tax = parsePercent(r.taxRate);
      return {
        description: r.description,
        quantity: Number(r.quantity) || 0,
        unitPrice: Number(r.unitPrice) || 0,
        taxRate: tax.ok ? tax.percent / 100 : 0,
        amount,
      };
    }),
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    balanceDue: config.settlesImmediately ? null : totals.total,
    paymentMethod: config.settlesImmediately ? paymentMethod : null,
    paymentReference: config.settlesImmediately ? paymentReference : null,
    refundSource: documentType === "refund_receipt" ? "sale" : null,
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="lines" value={linesJson} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="contactId">Customer</Label>
          <select id="contactId" name="contactId" required value={contactId} onChange={(e) => setContactId(e.target.value)} className={selectClass}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="issueDate">{config.dateLabel}</Label>
          <Input id="issueDate" name="issueDate" type="date" required value={issueDate} onChange={(e) => onIssueDateChange(e.target.value)} />
        </div>

        {config.settlesImmediately ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="paymentMethod">{documentType === "refund_receipt" ? "Refunded by" : "Paid by"}</Label>
              <select
                id="paymentMethod"
                name="paymentMethod"
                required
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={selectClass}
              >
                <option value="">Choose…</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="paymentReference">Reference (optional)</Label>
              <Input
                id="paymentReference"
                name="paymentReference"
                placeholder="Check #, transaction ID…"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="terms">Payment terms</Label>
              <select id="terms" value={terms} onChange={(e) => onTermsChange(e.target.value as TermsChoice)} className={selectClass}>
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Net</span>
                  <Input
                    id="customDays"
                    type="number"
                    min="0"
                    max="999"
                    step="1"
                    inputMode="numeric"
                    value={customDays}
                    onChange={(e) => onCustomDaysChange(e.target.value)}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
            )}
            <div className={`flex flex-col gap-2 ${terms === "custom" ? "" : "sm:col-span-2"}`}>
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
                aria-describedby="dueDateHint"
              />
              <p id="dueDateHint" className="text-xs text-muted-foreground">
                Optional — pick terms, choose a date, or leave it blank.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto pb-6">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium">Description</th>
              <th className="w-20 pb-2 font-medium">Qty</th>
              <th className="w-28 pb-2 font-medium">Unit price</th>
              <th className="w-24 pb-2 font-medium">Tax</th>
              <th className="w-28 pb-2 text-right font-medium">Amount</th>
              <th className="w-8 pb-2" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key}>
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`Line ${i + 1} description`}
                    value={row.description}
                    onChange={(e) => updateRow(row.key, { description: e.target.value })}
                  />
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
                    aria-label={`Line ${i + 1} unit price`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitPrice}
                    onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <PercentInput
                    aria-label={`Line ${i + 1} tax rate (percent)`}
                    value={row.taxRate}
                    onChange={(taxRate) => updateRow(row.key, { taxRate })}
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

      <Button type="button" variant="outline" className="-mt-4 w-fit rounded-full" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
        + Add line
      </Button>

      <div className="flex flex-col items-end gap-1 border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Subtotal {formatMoney(totals.subtotal)}</span>
        <span className="text-muted-foreground">Tax {formatMoney(totals.taxTotal)}</span>
        <span className="font-heading text-base font-semibold">
          {documentType === "refund_receipt" ? "Refund total" : "Total"} {formatMoney(totals.total)}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {blockingProblem && (
          <p className="mr-auto text-sm text-destructive" role="alert">
            {blockingProblem}
          </p>
        )}
        <Button type="button" variant="outline" className="rounded-full" onClick={() => setPreviewOpen(true)}>
          Preview
        </Button>
        <Button type="submit" disabled={pending || blockingProblem !== null} className="rounded-full">
          {pending ? "Saving…" : config.submitLabel}
        </Button>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <DocumentPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`${config.label} preview`}
        fileName={`${config.label} draft${customer ? ` – ${customer.display_name}` : ""}`}
      >
        <SalesDocumentPaper doc={previewDoc} businessName={businessName} />
      </DocumentPreviewDialog>
    </form>
  );
}

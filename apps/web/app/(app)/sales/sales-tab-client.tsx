"use client";

import { useState } from "react";
import Link from "next/link";
import { CollectionsClient } from "./collections-client";
import { formatDate } from "@/lib/dates";
import { SALES_DOCUMENTS, SALES_STATUS_STYLE, salesDocumentConfig, salesStatusLabel, type SalesDocumentType } from "@/lib/documents";

interface SalesDocumentRow {
  id: string;
  invoice_number: string;
  document_type: string;
  issue_date: string;
  due_date: string | null;
  total: number;
  balance_due: number;
  status: string;
  contact: { display_name: string } | null;
}

interface SalesTabClientProps {
  invoices: SalesDocumentRow[];
  schedules: any[];
  riskMetrics: Record<string, any>;
}

const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const TYPE_FILTERS: { value: "all" | SalesDocumentType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "invoice", label: "Invoices" },
  { value: "sales_receipt", label: "Sales receipts" },
  { value: "refund_receipt", label: "Refunds" },
  { value: "debit_note", label: "Debit notes" },
];

export function SalesTabClient({ invoices, schedules, riskMetrics }: SalesTabClientProps) {
  const [activeTab, setActiveTab] = useState<"invoices" | "collections">("invoices");
  const [typeFilter, setTypeFilter] = useState<"all" | SalesDocumentType>("all");
  const visible = typeFilter === "all" ? invoices : invoices.filter((inv) => (inv.document_type ?? "invoice") === typeFilter);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Sales & Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invoices, receipts, refunds, receivables, and the AR Collections Agent.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/sales/receive-payment"
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted"
          >
            Receive payment
          </Link>
          <Link
            href="/sales/new?type=invoice"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
          >
            + New Invoice
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("invoices")}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "invoices"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          Sales documents ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab("collections")}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "collections"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          AR Collections Hub ({schedules.length})
        </button>
      </div>

      {activeTab === "invoices" ? (
        <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
          <div className="overflow-x-auto rounded-xl bg-card p-4">
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={typeFilter === f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ${
                    typeFilter === f.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {visible.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Number</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Customer</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Due date</th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 pr-4 text-right font-medium">Balance</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((inv) => {
                    const config = salesDocumentConfig(inv.document_type);
                    return (
                      <tr key={inv.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={`/sales/${inv.id}`} className="font-medium text-primary hover:underline">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{config.label}</td>
                        <td className="py-2 pr-4">{inv.contact?.display_name ?? "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{formatDate(inv.issue_date)}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {config.settlesImmediately ? "—" : inv.due_date ? formatDate(inv.due_date) : "No due date"}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {config.isMoneyOut ? `−${currency(Number(inv.total))}` : currency(Number(inv.total))}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{config.settlesImmediately ? "—" : currency(Number(inv.balance_due))}</td>
                        <td className="py-2">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${SALES_STATUS_STYLE[inv.status] ?? ""}`}>
                            {salesStatusLabel(inv.document_type, inv.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                {typeFilter === "all" ? "Nothing here yet." : `No ${SALES_DOCUMENTS[typeFilter].label.toLowerCase()}s yet.`}
              </p>
            )}
          </div>
        </div>
      ) : (
        <CollectionsClient schedules={schedules} riskMetrics={riskMetrics} />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { CollectionsClient } from "./collections-client";

interface SalesTabClientProps {
  invoices: any[];
  schedules: any[];
  riskMetrics: Record<string, any>;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-secondary text-secondary-foreground",
  sent: "bg-chart-2/15 text-chart-2",
  partial: "bg-warning/15 text-warning",
  paid: "bg-positive/15 text-positive",
  overdue: "bg-destructive/15 text-destructive",
  void: "bg-muted text-muted-foreground",
};

const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function SalesTabClient({ invoices, schedules, riskMetrics }: SalesTabClientProps) {
  const [activeTab, setActiveTab] = useState<"invoices" | "collections">("invoices");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Sales & Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invoices, receivables, and automated AR Collections Agent.</p>
        </div>
        <Link
          href="/sales/new"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
        >
          + New Invoice
        </Link>
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
          Invoices ({invoices.length})
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
            {invoices.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Invoice #</th>
                    <th className="py-2 pr-4 font-medium">Customer</th>
                    <th className="py-2 pr-4 font-medium">Issue date</th>
                    <th className="py-2 pr-4 font-medium">Due date</th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 pr-4 text-right font-medium">Balance</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4">
                        <Link href={`/sales/${inv.id}`} className="font-medium text-primary hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{inv.contact?.display_name ?? "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{inv.issue_date}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{inv.due_date}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{currency(inv.total)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{currency(inv.balance_due)}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[inv.status] ?? ""}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No invoices yet.</p>
            )}
          </div>
        </div>
      ) : (
        <CollectionsClient schedules={schedules} riskMetrics={riskMetrics} />
      )}
    </div>
  );
}

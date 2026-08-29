"use client";

import { useState } from "react";
import { Download, FileText, Calendar, Table } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { BezelCard } from "@/components/bezel-card";

interface ReportsClientProps {
  pnlReport: {
    revenue: any[];
    expenses: any[];
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
  balanceSheet: {
    assets: any[];
    liabilities: any[];
    equity: any[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
  };
  arAging: {
    current: any[];
    days1_30: any[];
    days31_60: any[];
    days61_90: any[];
    days90Plus: any[];
  };
  apAging: {
    current: any[];
    days1_30: any[];
    days31_60: any[];
    days61_90: any[];
    days90Plus: any[];
  };
}

export function ReportsClient({
  pnlReport,
  balanceSheet,
  arAging,
  apAging,
}: ReportsClientProps) {
  const [activeReport, setActiveReport] = useState<"pnl" | "bs" | "ar" | "ap">("pnl");

  function handleExportCSV() {
    if (activeReport === "pnl") {
      const headers = ["Account Code", "Account Name", "Type", "Amount ($)"];
      const rows = [
        ...pnlReport.revenue.map((r) => [r.code, r.name, "Revenue", r.amount.toFixed(2)]),
        ...pnlReport.expenses.map((e) => [e.code, e.name, "Expense", e.amount.toFixed(2)]),
        ["---", "Total Revenue", "Summary", pnlReport.totalRevenue.toFixed(2)],
        ["---", "Total Expenses", "Summary", pnlReport.totalExpenses.toFixed(2)],
        ["---", "Net Income", "Summary", pnlReport.netIncome.toFixed(2)],
      ];
      downloadCSV("profit_and_loss_report.csv", headers, rows);
    } else if (activeReport === "bs") {
      const headers = ["Account Code", "Account Name", "Category", "Amount ($)"];
      const rows = [
        ...balanceSheet.assets.map((a) => [a.code, a.name, "Asset", a.amount.toFixed(2)]),
        ...balanceSheet.liabilities.map((l) => [l.code, l.name, "Liability", l.amount.toFixed(2)]),
        ...balanceSheet.equity.map((eq) => [eq.code, eq.name, "Equity", eq.amount.toFixed(2)]),
        ["---", "Total Assets", "Summary", balanceSheet.totalAssets.toFixed(2)],
        ["---", "Total Liabilities + Equity", "Summary", (balanceSheet.totalLiabilities + balanceSheet.totalEquity).toFixed(2)],
      ];
      downloadCSV("balance_sheet_report.csv", headers, rows);
    } else if (activeReport === "ar") {
      const headers = ["Aging Bracket", "Invoice Count", "Total Amount ($)"];
      const calcTotal = (arr: any[]) => arr.reduce((sum, inv) => sum + Number(inv.balance_due || inv.total || 0), 0);
      const rows = [
        ["Current", arAging.current.length, calcTotal(arAging.current).toFixed(2)],
        ["1-30 Days Overdue", arAging.days1_30.length, calcTotal(arAging.days1_30).toFixed(2)],
        ["31-60 Days Overdue", arAging.days31_60.length, calcTotal(arAging.days31_60).toFixed(2)],
        ["61-90 Days Overdue", arAging.days61_90.length, calcTotal(arAging.days61_90).toFixed(2)],
        ["90+ Days Overdue", arAging.days90Plus.length, calcTotal(arAging.days90Plus).toFixed(2)],
      ];
      downloadCSV("ar_aging_report.csv", headers, rows);
    } else if (activeReport === "ap") {
      const headers = ["Aging Bracket", "Bill Count", "Total Amount ($)"];
      const calcTotal = (arr: any[]) => arr.reduce((sum, bill) => sum + Number(bill.balance_due || bill.total || 0), 0);
      const rows = [
        ["Current", apAging.current.length, calcTotal(apAging.current).toFixed(2)],
        ["1-30 Days Overdue", apAging.days1_30.length, calcTotal(apAging.days1_30).toFixed(2)],
        ["31-60 Days Overdue", apAging.days31_60.length, calcTotal(apAging.days31_60).toFixed(2)],
        ["61-90 Days Overdue", apAging.days61_90.length, calcTotal(apAging.days61_90).toFixed(2)],
        ["90+ Days Overdue", apAging.days90Plus.length, calcTotal(apAging.days90Plus).toFixed(2)],
      ];
      downloadCSV("ap_aging_report.csv", headers, rows);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Standard GAAP reports generated directly from the general ledger.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 active:scale-[0.98]"
        >
          <Download className="h-4 w-4" />
          <span>Export to CSV</span>
        </button>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-border bg-card p-1.5 w-fit">
        {[
          { id: "pnl", label: "Profit & Loss" },
          { id: "bs", label: "Balance Sheet" },
          { id: "ar", label: "AR Aging" },
          { id: "ap", label: "AP Aging" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveReport(tab.id as any)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${
              activeReport === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* P&L View */}
      {activeReport === "pnl" && (
        <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="overflow-hidden rounded-xl bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="font-heading text-sm font-semibold text-foreground">Profit &amp; Loss Statement</h2>
          </div>
          <div className="p-6 space-y-6 text-xs">
            {/* Revenue */}
            <div>
              <h3 className="mb-2 font-semibold uppercase tracking-wide text-positive">Revenue</h3>
              {pnlReport.revenue.length === 0 ? (
                <p className="text-muted-foreground">No revenue recorded.</p>
              ) : (
                <div className="space-y-1.5">
                  {pnlReport.revenue.map((r) => (
                    <div key={r.code} className="flex justify-between border-b border-border/40 py-1 text-muted-foreground">
                      <span>{r.code} - {r.name}</span>
                      <span className="font-mono text-foreground">${r.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex justify-between font-bold text-foreground border-t border-border pt-1">
                <span>Total Revenue</span>
                <span className="font-mono text-positive">${pnlReport.totalRevenue.toFixed(2)}</span>
              </div>
            </div>

            {/* Expenses */}
            <div>
              <h3 className="mb-2 font-semibold uppercase tracking-wide text-foreground">Expenses</h3>
              {pnlReport.expenses.length === 0 ? (
                <p className="text-muted-foreground">No expenses recorded.</p>
              ) : (
                <div className="space-y-1.5">
                  {pnlReport.expenses.map((e) => (
                    <div key={e.code} className="flex justify-between border-b border-border/40 py-1 text-muted-foreground">
                      <span>{e.code} - {e.name}</span>
                      <span className="font-mono text-foreground">${e.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex justify-between font-bold text-foreground border-t border-border pt-1">
                <span>Total Expenses</span>
                <span className="font-mono text-foreground">${pnlReport.totalExpenses.toFixed(2)}</span>
              </div>
            </div>

            {/* Net Income Summary */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex justify-between text-sm font-bold">
              <span>Net Income</span>
              <span className={`font-mono ${pnlReport.netIncome >= 0 ? "text-positive" : "text-destructive"}`}>
                ${pnlReport.netIncome.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Balance Sheet View */}
      {activeReport === "bs" && (
        <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="overflow-hidden rounded-xl bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="font-heading text-sm font-semibold text-foreground">Balance Sheet</h2>
          </div>
          <div className="p-6 space-y-6 text-xs">
            {/* Assets */}
            <div>
              <h3 className="mb-2 font-semibold uppercase tracking-wide text-primary">Assets</h3>
              <div className="space-y-1.5">
                {balanceSheet.assets.map((a) => (
                  <div key={a.code} className="flex justify-between border-b border-border/40 py-1 text-muted-foreground">
                    <span>{a.code} - {a.name}</span>
                    <span className="font-mono text-foreground">${a.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-bold text-foreground border-t border-border pt-1">
                <span>Total Assets</span>
                <span className="font-mono text-primary">${balanceSheet.totalAssets.toFixed(2)}</span>
              </div>
            </div>

            {/* Liabilities */}
            <div>
              <h3 className="mb-2 font-semibold uppercase tracking-wide text-warning">Liabilities</h3>
              <div className="space-y-1.5">
                {balanceSheet.liabilities.map((l) => (
                  <div key={l.code} className="flex justify-between border-b border-border/40 py-1 text-muted-foreground">
                    <span>{l.code} - {l.name}</span>
                    <span className="font-mono text-foreground">${l.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-bold text-foreground border-t border-border pt-1">
                <span>Total Liabilities</span>
                <span className="font-mono text-warning">${balanceSheet.totalLiabilities.toFixed(2)}</span>
              </div>
            </div>

            {/* Equity */}
            <div>
              <h3 className="mb-2 font-semibold uppercase tracking-wide text-foreground">Equity</h3>
              <div className="space-y-1.5">
                {balanceSheet.equity.map((eq) => (
                  <div key={eq.code} className="flex justify-between border-b border-border/40 py-1 text-muted-foreground">
                    <span>{eq.code} - {eq.name}</span>
                    <span className="font-mono text-foreground">${eq.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-bold text-foreground border-t border-border pt-1">
                <span>Total Equity</span>
                <span className="font-mono text-foreground">${balanceSheet.totalEquity.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* AR Aging View */}
      {activeReport === "ar" && (
        <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="overflow-hidden rounded-xl bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="font-heading text-sm font-semibold text-foreground">Accounts Receivable (AR) Aging Report</h2>
          </div>
          <div className="p-6 text-xs space-y-4">
            {[
              { label: "Current (Not Overdue)", items: arAging.current },
              { label: "1 - 30 Days Overdue", items: arAging.days1_30 },
              { label: "31 - 60 Days Overdue", items: arAging.days31_60 },
              { label: "61 - 90 Days Overdue", items: arAging.days61_90 },
              { label: "90+ Days Overdue", items: arAging.days90Plus },
            ].map((bracket, idx) => {
              const total = bracket.items.reduce((sum, item) => sum + Number(item.balance_due || item.total || 0), 0);
              return (
                <div key={idx} className="rounded-xl border border-border/60 p-4">
                  <div className="flex justify-between font-semibold text-foreground mb-2">
                    <span>{bracket.label} ({bracket.items.length} invoices)</span>
                    <span className="font-mono">${total.toFixed(2)}</span>
                  </div>
                  {bracket.items.length === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    <div className="space-y-1 text-muted-foreground">
                      {bracket.items.map((inv) => (
                        <div key={inv.id} className="flex justify-between text-xs">
                          <span>Invoice #{inv.invoice_number} ({inv.customer?.display_name || "Customer"})</span>
                          <span className="font-mono text-foreground">${Number(inv.balance_due || inv.total).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {/* AP Aging View */}
      {activeReport === "ap" && (
        <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="overflow-hidden rounded-xl bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="font-heading text-sm font-semibold text-foreground">Accounts Payable (AP) Aging Report</h2>
          </div>
          <div className="p-6 text-xs space-y-4">
            {[
              { label: "Current (Not Overdue)", items: apAging.current },
              { label: "1 - 30 Days Overdue", items: apAging.days1_30 },
              { label: "31 - 60 Days Overdue", items: apAging.days31_60 },
              { label: "61 - 90 Days Overdue", items: apAging.days61_90 },
              { label: "90+ Days Overdue", items: apAging.days90Plus },
            ].map((bracket, idx) => {
              const total = bracket.items.reduce((sum, item) => sum + Number(item.balance_due || item.total || 0), 0);
              return (
                <div key={idx} className="rounded-xl border border-border/60 p-4">
                  <div className="flex justify-between font-semibold text-foreground mb-2">
                    <span>{bracket.label} ({bracket.items.length} bills)</span>
                    <span className="font-mono">${total.toFixed(2)}</span>
                  </div>
                  {bracket.items.length === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    <div className="space-y-1 text-muted-foreground">
                      {bracket.items.map((bill) => (
                        <div key={bill.id} className="flex justify-between text-xs">
                          <span>Bill #{bill.bill_number} ({bill.vendor?.display_name || "Vendor"})</span>
                          <span className="font-mono text-foreground">${Number(bill.balance_due || bill.total).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

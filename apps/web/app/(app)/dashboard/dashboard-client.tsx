"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ArrowDownLeft, Building2, AlertCircle, Sparkles, CheckCircle2, Lock, ArrowRight } from "lucide-react";

interface DashboardClientProps {
  firstName: string;
  role: string | null;
  kpis: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    netCashFlow: number;
  };
  bankAccounts: any[];
  reconciliationSummary: {
    autoMatched: number;
    needsReview: number;
    unmatched: number;
    exceptions: number;
  };
  expenseCategories: Array<{ name: string; amount: number }>;
  overdueAlerts: {
    count: number;
    totalAmount: number;
    items: any[];
  };
  recentTransactions: any[];
}

function BezelCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06] ${className}`}>
      <div className="h-full rounded-xl bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        {children}
      </div>
    </div>
  );
}

const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function DashboardClient({
  firstName,
  role,
  kpis,
  bankAccounts,
  reconciliationSummary,
  expenseCategories,
  overdueAlerts,
  recentTransactions,
}: DashboardClientProps) {
  const [daysRange, setDaysRange] = useState("30");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const totalExpenseSum = expenseCategories.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Greeting Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Live financial operating metrics{role ? ` · ${role}` : ""}.
          </p>
        </div>

        <select
          value={daysRange}
          onChange={(e) => setDaysRange(e.target.value)}
          className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-foreground/5 focus:outline-hidden"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {/* Connected Bank Accounts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {bankAccounts.map((acct) => (
          <BezelCard key={acct.id}>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary">
                {acct.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{acct.name}</p>
                <p className="text-xs text-muted-foreground">{acct.institution_name || "Bank Account"}</p>
              </div>
            </div>
            <p className="mt-4 font-mono text-xl font-semibold tabular-nums text-foreground">
              {currency(Number(acct.current_balance || 0))}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Updated {acct.last_synced_at?.slice(0, 10) || "recently"}</p>
          </BezelCard>
        ))}

        <Link
          href="/banking"
          className="flex min-h-[132px] items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/30 p-4 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Building2 className="h-4 w-4 text-primary" />
          <span>Connect or Manage Bank Accounts</span>
        </Link>
      </div>

      {/* Live Financial KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BezelCard>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Income</span>
          <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-emerald-500">{currency(kpis.totalIncome)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Live revenue debits/credits</p>
        </BezelCard>

        <BezelCard>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Expenses</span>
          <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">{currency(kpis.totalExpenses)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Live expense GL rollups</p>
        </BezelCard>

        <BezelCard>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net Profit</span>
          <p className={`mt-3 font-mono text-2xl font-bold tabular-nums ${kpis.netProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
            {currency(kpis.netProfit)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Income minus Expenses</p>
        </BezelCard>

        <BezelCard>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net Cash Flow</span>
          <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-primary">{currency(kpis.netCashFlow)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Cash 1000 net movement</p>
        </BezelCard>
      </div>

      {/* Reconciliation Center Summary + Cash Flow Forecast */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Reconciliation Panel */}
        <BezelCard>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-foreground">Reconciliation Center</h2>
            <Link href="/reconciliation" className="text-xs font-medium text-primary hover:underline">
              Open Workspace →
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Needs Review</div>
              <div className="mt-1 font-mono text-lg font-bold text-amber-500">{reconciliationSummary.needsReview}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Approved</div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-500">{reconciliationSummary.autoMatched}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Exceptions</div>
              <div className="mt-1 font-mono text-lg font-bold text-destructive">{reconciliationSummary.exceptions}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Unmatched Lines</div>
              <div className="mt-1 font-mono text-lg font-bold text-foreground">{reconciliationSummary.unmatched}</div>
            </div>
          </div>
        </BezelCard>

        {/* Cash Flow Forecast Panel */}
        <BezelCard>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-foreground">Cash Flow Forecast</h2>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-px w-3 bg-emerald-500" /> Actual</span>
              <span className="flex items-center gap-1"><span className="h-px w-3 border-t border-dashed border-muted-foreground" /> Projection</span>
            </div>
          </div>
          <div className="mt-4 flex h-28 items-center justify-center rounded-xl border border-border/50 bg-black/20 p-4">
            <svg viewBox="0 0 300 60" className="h-full w-full">
              <path d="M0 45 L50 35 L100 40 L150 25" fill="none" stroke="var(--positive)" strokeWidth="2.5" />
              <path d="M150 25 L200 20 L250 28 L300 15" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
          </div>
        </BezelCard>
      </div>

      {/* Exception Alerts + Top Expense Categories */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Exception Alerts */}
        <BezelCard>
          <h2 className="font-heading text-sm font-semibold text-foreground">Exception & Operational Alerts</h2>
          <div className="mt-3 space-y-2">
            {/* Real Alert: Overdue Invoices */}
            <Link
              href="/sales"
              className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs transition-colors hover:bg-destructive/15"
            >
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">Overdue Invoices ({overdueAlerts.count})</span>
              </div>
              <span className="font-mono font-bold text-destructive">{currency(overdueAlerts.totalAmount)}</span>
            </Link>

            {/* Locked Teaser Alerts */}
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3 text-xs opacity-50">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                <span>High Expense Anomaly Detector</span>
              </div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">Pro Plan</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3 text-xs opacity-50">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                <span>Low Inventory Stock Reorder</span>
              </div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">Growth Plan</span>
            </div>
          </div>
        </BezelCard>

        {/* Top Expense Categories */}
        <BezelCard>
          <h2 className="font-heading text-sm font-semibold text-foreground">Top Expense Categories</h2>
          {expenseCategories.length === 0 ? (
            <div className="mt-4 text-xs text-muted-foreground">No posted expenses found for this period.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {expenseCategories.map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{cat.name}</span>
                  <span className="font-mono font-semibold text-foreground">{currency(cat.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </BezelCard>
      </div>

      {/* Recent Transactions Feed */}
      <BezelCard>
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">Unified Transactions Timeline</h2>
          <Link href="/transactions" className="text-xs font-medium text-primary hover:underline">
            View All Transactions →
          </Link>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No recent transactions.</div>
        ) : (
          <div className="divide-y divide-border/40 text-xs">
            {recentTransactions.slice(0, 5).map((tx) => {
              const isCredit = Number(tx.amount) > 0;
              return (
                <div key={`${tx.transaction_type}_${tx.id}`} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${isCredit ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{tx.description}</div>
                      <div className="text-[11px] text-muted-foreground">{tx.party_name || "General"} • {tx.transaction_date}</div>
                    </div>
                  </div>

                  <span className={`font-mono font-semibold ${isCredit ? "text-emerald-500" : "text-foreground"}`}>
                    {isCredit ? "+" : ""}${Math.abs(Number(tx.amount || 0)).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </BezelCard>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { BezelCard } from "@/components/bezel-card";

interface BankAccountRow {
  id: string;
  name: string;
  account_type: string | null;
  current_balance: number | string | null;
}

interface RecentTransactionRow {
  id: string | null;
  transaction_type: string | null;
  description: string | null;
  party_name: string | null;
  transaction_date: string | null;
  amount: number | string | null;
}

interface DashboardClientProps {
  firstName: string;
  role: string | null;
  kpis: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    netCashFlow: number;
    trends: {
      totalIncome: number | null;
      totalExpenses: number | null;
      netProfit: number | null;
      netCashFlow: number | null;
    };
  };
  bankAccounts: BankAccountRow[];
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
    items: unknown[];
  };
  recentTransactions: RecentTransactionRow[];
}

const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const icon = {
  bank: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3.5 9.5 12 4l8.5 5.5M5 9.5v8M9.5 9.5v8M14.5 9.5v8M19 9.5v8M3.5 19.5h17" />
    </svg>
  ),
  in: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 8h13l-3-3" />
    </svg>
  ),
  out: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 16H7l3 3" />
    </svg>
  ),
  alertTriangle: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3.5 21 19.5H3Z" />
      <path d="M12 9.5v4.5M12 17h.01" />
    </svg>
  ),
  box: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z M3.5 7.5 12 11.5l8.5-4" />
    </svg>
  ),
  clock: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  shield: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3.5 5 6.5v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9v-5Z" />
    </svg>
  ),
  bolt: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M13 3.5 5 13.5h5.5L11 20.5l8-11h-5.5Z" />
    </svg>
  ),
  pulse: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 19V9M10 19V5M16 19v-7M22 5l-8 8-4-4-6 6" />
    </svg>
  ),
  headset: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3.5a8.5 8.5 0 0 0-8.5 8.5v4a2 2 0 0 0 2 2h1v-6h-2.9M20.5 12a8.5 8.5 0 0 0-8.5-8.5M20.5 12v4a2 2 0 0 1-2 2h-1v-6h2.9" />
    </svg>
  ),
};

function TrendPill({ value }: { value: number | null }) {
  if (value === null) return null;
  const positive = value >= 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
        positive ? "bg-positive/10 text-positive" : "bg-destructive/10 text-destructive"
      }`}
    >
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function Donut({
  segments,
  centerLabel,
  centerSub,
}: {
  segments: { value: number; color: string }[];
  centerLabel: string;
  centerSub: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 15.9155;
  const arcs = segments.reduce<{ items: { dasharray: string; dashoffset: number }[]; cursor: number }>(
    (state, seg) => {
      const pct = (seg.value / total) * 100;
      state.items.push({ dasharray: `${pct} ${100 - pct}`, dashoffset: -state.cursor });
      state.cursor += pct;
      return state;
    },
    { items: [], cursor: 0 },
  ).items;

  return (
    <div className="relative mx-auto size-28 shrink-0">
      <svg viewBox="0 0 36 36" className="size-28 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--muted)" strokeWidth="3.5" />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="3.5"
            strokeDasharray={arcs[i].dasharray}
            strokeDashoffset={arcs[i].dashoffset}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-base font-semibold tabular-nums text-foreground">{centerLabel}</span>
        <span className="text-[9px] text-muted-foreground">{centerSub}</span>
      </div>
    </div>
  );
}

const sampleProjects = [
  { name: "Website Redesign", progress: 75, billed: 18450, budget: 24500, margin: 32 },
  { name: "Office Buildout", progress: 62, billed: 8920, budget: 14300, margin: 23 },
  { name: "Product Launch", progress: 48, billed: 6230, budget: 13000, margin: 41 },
];

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

  const totalExpenseSum = expenseCategories.reduce((sum, c) => sum + c.amount, 0) || 1;
  const expenseColors = ["var(--chart-1)", "var(--chart-2)", "var(--warning)", "var(--destructive)", "var(--chart-5)"];

  const reconTotal =
    reconciliationSummary.autoMatched + reconciliationSummary.needsReview + reconciliationSummary.exceptions + reconciliationSummary.unmatched;
  const autoMatchedPct = reconTotal > 0 ? Math.round((reconciliationSummary.autoMatched / reconTotal) * 100) : 0;

  const kpiCards = [
    { label: "Total Income", value: kpis.totalIncome, trend: kpis.trends.totalIncome, tone: "positive" as const },
    { label: "Total Expenses", value: kpis.totalExpenses, trend: kpis.trends.totalExpenses, tone: "neutral" as const },
    { label: "Net Profit", value: kpis.netProfit, trend: kpis.trends.netProfit, tone: kpis.netProfit >= 0 ? ("positive" as const) : ("negative" as const) },
    { label: "Net Cash Flow", value: kpis.netCashFlow, trend: kpis.trends.netCashFlow, tone: "primary" as const },
  ];

  const toneClass = { positive: "text-positive", negative: "text-destructive", primary: "text-primary", neutral: "text-foreground" };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Greeting Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
            {greeting}, {firstName}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with your business today{role ? ` · signed in as ${role}` : ""}.
          </p>
        </div>

        <select
          value={daysRange}
          onChange={(e) => setDaysRange(e.target.value)}
          className="cursor-pointer rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-soft-sm transition-colors duration-200 hover:bg-foreground/5 focus:outline-hidden"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {/* KPIs (left, wide) + Bank Accounts (right rail) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {kpiCards.map((card) => (
            <BezelCard key={card.label}>
              <div className="flex items-start justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</span>
                <TrendPill value={card.trend} />
              </div>
              <p className={`mt-3 font-heading text-2xl font-semibold tabular-nums ${toneClass[card.tone]}`}>{currency(card.value)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">vs previous {daysRange} days</p>
            </BezelCard>
          ))}
        </div>

        <BezelCard className="flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-foreground">Bank accounts</h2>
            <Link href="/banking" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-3 flex-1 space-y-2.5">
            {bankAccounts.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No accounts connected yet.</p>
            ) : (
              bankAccounts.slice(0, 3).map((acct) => {
                const negative = Number(acct.current_balance || 0) < 0;
                return (
                  <div key={acct.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <icon.bank className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">{acct.name}</p>
                      <p className="text-[10.5px] text-muted-foreground">
                        {(acct.account_type || "checking").replace(/^\w/, (c: string) => c.toUpperCase())} •••• {String(acct.id).slice(-4)}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${negative ? "text-destructive" : "text-foreground"}`}>
                      {currency(Number(acct.current_balance || 0))}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <Link
            href="/banking"
            className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary"
          >
            + Connect a bank
          </Link>
        </BezelCard>
      </div>

      {/* Reconciliation + Cash Flow + Project Profitability */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BezelCard>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-foreground">Reconciliation Center</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{reconTotal.toLocaleString()} total</span>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Donut
              segments={[
                { value: reconciliationSummary.autoMatched, color: "var(--chart-1)" },
                { value: reconciliationSummary.needsReview, color: "var(--warning)" },
                { value: reconciliationSummary.exceptions, color: "var(--destructive)" },
                { value: reconciliationSummary.unmatched, color: "var(--chart-2)" },
              ]}
              centerLabel={reconciliationSummary.autoMatched.toLocaleString()}
              centerSub={`${autoMatchedPct}% matched`}
            />
            <ul className="flex-1 space-y-1.5 text-xs">
              <li className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
                <span className="text-muted-foreground">Auto-matched</span>
                <span className="ml-auto font-medium tabular-nums">{reconciliationSummary.autoMatched}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-warning" />
                <span className="text-muted-foreground">Needs review</span>
                <span className="ml-auto font-medium tabular-nums">{reconciliationSummary.needsReview}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-destructive" />
                <span className="text-muted-foreground">Exceptions</span>
                <span className="ml-auto font-medium tabular-nums">{reconciliationSummary.exceptions}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: "var(--chart-2)" }} />
                <span className="text-muted-foreground">Unmatched</span>
                <span className="ml-auto font-medium tabular-nums">{reconciliationSummary.unmatched}</span>
              </li>
            </ul>
          </div>
          <Link href="/reconciliation" className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">
            Go to reconciliation →
          </Link>
        </BezelCard>

        <BezelCard>
          <h2 className="font-heading text-sm font-semibold text-foreground">Cash Flow Forecast</h2>
          <div className="mt-4 flex h-28 items-center justify-center rounded-xl bg-muted/40 p-4">
            <svg viewBox="0 0 300 60" className="h-full w-full">
              <path d="M0 45 L50 35 L100 40 L150 25" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M150 25 L200 20 L250 28 L300 15" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
              <circle cx="150" cy="25" r="3" fill="var(--primary)" />
            </svg>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-px w-3 bg-primary" /> Actual
            </span>
            <span className="flex items-center gap-1">
              <span className="h-px w-3 border-t border-dashed border-muted-foreground" /> Forecast
            </span>
          </div>
          <Link href="/reports" className="mt-3 inline-flex text-xs font-medium text-primary hover:underline">
            View cash flow forecast →
          </Link>
        </BezelCard>

        <BezelCard>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-foreground">Project Profitability</h2>
            <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3.5">
            {sampleProjects.map((p) => (
              <div key={p.name}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-foreground">{p.name}</span>
                  <span className="text-positive">{p.margin}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                </div>
                <div className="mt-1 text-[10.5px] text-muted-foreground">
                  {currency(p.billed)} / {currency(p.budget)} billed
                </div>
              </div>
            ))}
          </div>
        </BezelCard>
      </div>

      {/* Exception Alerts + Top Expense Categories + Recent Transactions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BezelCard>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-foreground">Exception alerts</h2>
            {overdueAlerts.count > 0 && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">{overdueAlerts.count}</span>
            )}
          </div>
          <ul className="mt-3 space-y-1">
            {overdueAlerts.count > 0 && (
              <li>
                <Link href="/sales" className="flex items-center gap-3 rounded-xl px-1 py-2 transition-colors duration-200 hover:bg-destructive/5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <icon.clock className="size-3.5" />
                  </span>
                  <span className="flex-1 text-xs">
                    <span className="font-medium text-foreground">Overdue invoices</span>
                    <span className="block text-[10.5px] text-muted-foreground">{overdueAlerts.count} invoices past due</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-destructive">{currency(overdueAlerts.totalAmount)}</span>
                </Link>
              </li>
            )}
            <li className="flex items-center gap-3 rounded-xl px-1 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
                <icon.alertTriangle className="size-3.5" />
              </span>
              <span className="flex-1 text-xs">
                <span className="font-medium text-foreground">High expense detected</span>
                <span className="block text-[10.5px] text-muted-foreground">Travel expense 48% above usual</span>
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-xl px-1 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
                <icon.box className="size-3.5" />
              </span>
              <span className="flex-1 text-xs">
                <span className="font-medium text-foreground">Low inventory</span>
                <span className="block text-[10.5px] text-muted-foreground">3 items below reorder point</span>
              </span>
            </li>
            {overdueAlerts.count === 0 && (
              <li className="rounded-xl bg-positive/5 px-3 py-2.5 text-xs text-muted-foreground">No overdue invoices right now.</li>
            )}
          </ul>
        </BezelCard>

        <BezelCard>
          <h2 className="font-heading text-sm font-semibold text-foreground">Top expense categories</h2>
          {expenseCategories.length === 0 ? (
            <p className="mt-6 text-center text-xs text-muted-foreground">No posted expenses for this period.</p>
          ) : (
            <div className="mt-4 flex items-center gap-4">
              <Donut
                segments={expenseCategories.map((c, i) => ({ value: c.amount, color: expenseColors[i % expenseColors.length] }))}
                centerLabel={currency(totalExpenseSum)}
                centerSub="Total"
              />
              <ul className="flex-1 space-y-1.5 text-xs">
                {expenseCategories.slice(0, 5).map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: expenseColors[i % expenseColors.length] }} />
                    <span className="truncate text-muted-foreground">{c.name}</span>
                    <span className="ml-auto shrink-0 font-medium tabular-nums">{Math.round((c.amount / totalExpenseSum) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href="/reports" className="mt-3 inline-flex text-xs font-medium text-primary hover:underline">
            View expense report →
          </Link>
        </BezelCard>

        <BezelCard>
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <h2 className="font-heading text-sm font-semibold text-foreground">Recent transactions</h2>
            <Link href="/transactions" className="text-xs font-medium text-primary hover:underline">
              View all
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
                      <span className={`flex size-7 items-center justify-center rounded-full ${isCredit ? "bg-positive/10 text-positive" : "bg-muted text-muted-foreground"}`}>
                        {isCredit ? <icon.in className="size-3.5" /> : <icon.out className="size-3.5" />}
                      </span>
                      <div>
                        <div className="font-medium text-foreground">{tx.description || "Transaction"}</div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {tx.party_name || "General"} • {tx.transaction_date || "—"}
                        </div>
                      </div>
                    </div>
                    <span className={`font-medium tabular-nums ${isCredit ? "text-positive" : "text-foreground"}`}>
                      {isCredit ? "+" : "-"}
                      {currency(Math.abs(Number(tx.amount || 0)))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </BezelCard>
      </div>

      {/* Trust footer */}
      <footer className="grid grid-cols-2 gap-6 border-t border-border/60 pt-8 pb-4 sm:grid-cols-4">
        {[
          { label: "Secure & Reliable", caption: "Enterprise-grade security & compliance", Icon: icon.shield },
          { label: "Smarter Automation", caption: "AI handles the busy work so you can grow", Icon: icon.bolt },
          { label: "Real-time Insights", caption: "Accurate, live financial data always", Icon: icon.pulse },
          { label: "Expert Support", caption: "Real accounting help when you need it", Icon: icon.headset },
        ].map(({ label, caption, Icon }) => (
          <div key={label} className="flex flex-col items-center gap-2 text-center">
            <Icon className="size-4 text-primary" />
            <span className="text-[11px] font-medium text-foreground">{label}</span>
            <span className="text-[10px] leading-snug text-muted-foreground">{caption}</span>
          </div>
        ))}
      </footer>
    </div>
  );
}

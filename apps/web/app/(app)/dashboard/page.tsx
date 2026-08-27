import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const w = 100;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none">
      <path
        d={path}
        fill="none"
        stroke={positive ? "var(--positive)" : "var(--destructive)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

function BezelCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06] ${className}`}>
      <div className="h-full rounded-xl bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        {children}
      </div>
    </div>
  );
}

function TrendPill({ value }: { value: number }) {
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

const kpis = [
  { label: "Total Income", value: 84250, trend: 12.4, points: [40, 44, 42, 50, 55, 60, 58, 66] },
  { label: "Total Expenses", value: 52180, trend: 3.1, points: [30, 34, 32, 33, 36, 35, 38, 39] },
  { label: "Net Profit", value: 32070, trend: 24.8, points: [10, 14, 18, 16, 22, 26, 28, 34] },
  { label: "Net Cash Flow", value: 18940, trend: -4.2, points: [30, 28, 26, 27, 24, 22, 20, 19] },
];

const bankAccounts = [
  { initial: "C", name: "Chase Operating", mask: "4928", balance: 142850, negative: false, updated: "10 mins ago" },
  { initial: "A", name: "Amex Platinum", mask: "1102", balance: -12450, negative: true, updated: "2 hours ago" },
  { initial: "S", name: "Silicon Valley Bank", mask: "8821", balance: 45210.5, negative: false, updated: "1 hour ago" },
];

const reconciliation = [
  { label: "Auto-matched", value: 337, color: "var(--positive)" },
  { label: "Needs Review", value: 72, color: "var(--warning)" },
  { label: "Unmatched", value: 49, color: "var(--chart-2)" },
  { label: "Exceptions", value: 24, color: "var(--destructive)" },
];

const expenseCategories = [
  { label: "Payroll", value: 24500, color: "var(--positive)" },
  { label: "Software", value: 9800, color: "var(--chart-2)" },
  { label: "Rent", value: 8200, color: "var(--warning)" },
  { label: "Marketing", value: 5680, color: "var(--destructive)" },
  { label: "Other", value: 4000, color: "var(--muted-foreground)" },
];

const recentTransactions = [
  { name: "Stripe Payout", date: "Oct 23", amount: 12450, income: true },
  { name: "Apple Store", date: "Oct 24", amount: -199, income: false },
  { name: "WeWork Office", date: "Oct 22", amount: -2400, income: false },
  { name: "Google Ads", date: "Oct 21", amount: -1200, income: false },
];

function Donut({ segments, centerLabel, centerSub }: { segments: { value: number; color: string }[]; centerLabel: string; centerSub: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 15.9155;
  const arcs = segments.reduce<{ items: { dasharray: string; dashoffset: number }[]; cursor: number }>(
    (state, seg) => {
      const pct = (seg.value / total) * 100;
      state.items.push({ dasharray: `${pct} ${100 - pct}`, dashoffset: -state.cursor });
      state.cursor += pct;
      return state;
    },
    { items: [], cursor: 0 }
  ).items;

  return (
    <div className="relative mx-auto size-32">
      <svg viewBox="0 0 36 36" className="size-32 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--muted)" strokeWidth="4" />
        {segments.map((seg, i) => {
          const { dasharray, dashoffset } = arcs[i];
          return (
            <circle
              key={i}
              cx="18"
              cy="18"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="4"
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-lg font-semibold tabular-nums">{centerLabel}</span>
        <span className="text-[10px] text-muted-foreground">{centerSub}</span>
      </div>
    </div>
  );
}

const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { role } = await loadTenantContext();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (profile?.full_name ?? "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Greeting header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s how your business is doing{role ? ` · signed in as ${role}` : ""}.
          </p>
        </div>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-foreground/5"
        >
          Last 30 days
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Bank accounts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {bankAccounts.map((acct) => (
          <BezelCard key={acct.name}>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary">
                {acct.initial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{acct.name}</p>
                <p className="text-xs text-muted-foreground">•••• {acct.mask}</p>
              </div>
            </div>
            <p
              className={`mt-4 font-heading text-xl font-semibold tabular-nums ${
                acct.negative ? "text-destructive" : ""
              }`}
            >
              {acct.negative ? "-" : ""}
              {currency(Math.abs(acct.balance))}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Updated {acct.updated}</p>
          </BezelCard>
        ))}
        <button
          type="button"
          className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Connect a bank
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <BezelCard key={kpi.label}>
            <div className="flex items-start justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {kpi.label}
              </span>
              <TrendPill value={kpi.trend} />
            </div>
            <p className="mt-3 font-heading text-2xl font-semibold tabular-nums">
              {currency(kpi.value)}
            </p>
            <div className="mt-3">
              <Sparkline points={kpi.points} positive={kpi.trend >= 0} />
            </div>
          </BezelCard>
        ))}
      </div>

      {/* Reconciliation + Cash flow */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BezelCard>
          <h2 className="font-heading text-sm font-semibold">Reconciliation Center</h2>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
            <Donut segments={reconciliation} centerLabel="482" centerSub="Total" />
            <ul className="space-y-2 text-sm">
              {reconciliation.map((seg) => (
                <li key={seg.label} className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground">{seg.label}</span>
                  <span className="ml-auto tabular-nums font-medium">{seg.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">Across 3 accounts</p>
        </BezelCard>

        <BezelCard>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Cash Flow Forecast</h2>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-px w-3 bg-positive" /> Actual
              </span>
              <span className="flex items-center gap-1">
                <span className="h-px w-3 border-t border-dashed border-muted-foreground" /> Forecast
              </span>
            </div>
          </div>
          <svg viewBox="0 0 300 100" className="mt-4 h-32 w-full" preserveAspectRatio="none">
            <path
              d="M0 70 L40 60 L80 65 L120 45 L160 50"
              fill="none"
              stroke="var(--positive)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M160 50 L200 40 L240 44 L300 25"
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
            <line x1="160" y1="0" x2="160" y2="100" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 3" />
          </svg>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span className="text-foreground">Today</span>
            <span>Jun</span>
            <span>Jul</span>
          </div>
        </BezelCard>
      </div>

      {/* Project profitability (locked) + Exception alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BezelCard>
          <h2 className="font-heading text-sm font-semibold">Project Profitability</h2>
          <div className="relative mt-4 h-32 overflow-hidden rounded-lg">
            <div className="flex h-full items-end gap-2 opacity-40">
              {[40, 70, 55, 90, 60, 75, 50].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-muted-foreground" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/70 px-6 text-center backdrop-blur-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5 text-muted-foreground">
                <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              </svg>
              <p className="text-xs font-medium leading-tight">Track profitability across every project</p>
              <button
                type="button"
                className="cursor-pointer rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
              >
                Upgrade
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Available on the Growth plan</p>
        </BezelCard>

        <BezelCard>
          <h2 className="font-heading text-sm font-semibold">Exception Alerts</h2>
          <ul className="mt-3 space-y-1">
            <li className="flex items-center gap-3 rounded-lg px-2 py-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--destructive)" strokeWidth="1.5" className="size-4 shrink-0">
                <circle cx="12" cy="12" r="8.5" />
                <path strokeLinecap="round" d="M12 8v5M12 16h.01" />
              </svg>
              <span className="flex-1 text-sm">Overdue Invoices</span>
              <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                7
              </span>
              <span className="text-sm font-medium tabular-nums text-destructive">$12,450</span>
            </li>
            {["High Expense Detected", "Low Inventory"].map((label) => (
              <li key={label} className="flex items-center gap-3 rounded-lg px-2 py-2 opacity-40">
                <span className="size-4 shrink-0 rounded-full border border-current" />
                <span className="flex-1 text-sm">{label}</span>
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px]">Coming soon</span>
              </li>
            ))}
          </ul>
        </BezelCard>
      </div>

      {/* Expense categories + Recent transactions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BezelCard>
          <h2 className="font-heading text-sm font-semibold">Top Expense Categories</h2>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
            <Donut
              segments={expenseCategories}
              centerLabel={currency(expenseCategories.reduce((s, c) => s + c.value, 0))}
              centerSub="Total"
            />
            <ul className="space-y-2 text-sm">
              {expenseCategories.map((cat) => (
                <li key={cat.label} className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-muted-foreground">{cat.label}</span>
                  <span className="ml-auto tabular-nums font-medium">{currency(cat.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </BezelCard>

        <BezelCard>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Recent Transactions</h2>
            <button type="button" className="cursor-pointer text-xs font-medium text-primary hover:underline">
              View all
            </button>
          </div>
          <ul className="mt-3 divide-y divide-border/60">
            {recentTransactions.map((tx) => (
              <li key={tx.name} className="flex items-center gap-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4">
                    <path strokeLinecap="round" d="M4 8h13l-3-3M20 16H7l3 3" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tx.name}</p>
                  <p className="text-xs text-muted-foreground">{tx.date}</p>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums ${tx.income ? "text-positive" : ""}`}
                >
                  {tx.amount >= 0 ? "+" : "-"}
                  {currency(Math.abs(tx.amount))}
                </span>
              </li>
            ))}
          </ul>
        </BezelCard>
      </div>

      {/* Trust footer */}
      <footer className="grid grid-cols-2 gap-6 border-t border-border/60 pt-8 pb-4 sm:grid-cols-4">
        {[
          { label: "Secure & Reliable", icon: "M12 3.5 5 6.5v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9v-5Z" },
          { label: "Smarter Automation", icon: "M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2" },
          { label: "Real-time Insights", icon: "M4 19V9M10 19V5M16 19v-7M22 5l-8 8-4-4-6 6" },
          { label: "Expert Support", icon: "M12 3.5a8.5 8.5 0 0 0-8.5 8.5v4a2 2 0 0 0 2 2h1v-6h-2.9M20.5 12a8.5 8.5 0 0 0-8.5-8.5M20.5 12v4a2 2 0 0 1-2 2h-1v-6h2.9" },
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-2 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="size-4 text-muted-foreground/60">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="text-[11px] tracking-wide text-muted-foreground/70">{item.label}</span>
          </div>
        ))}
      </footer>
    </div>
  );
}

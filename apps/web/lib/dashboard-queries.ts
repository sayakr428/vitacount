import { createClient } from "@/lib/supabase/server";
import { buildBuckets, bucketIndex, type DashboardRange } from "@/lib/date-range";
import { fetchAccountIndex, fetchLedgerLines, type LedgerAccount, type LedgerLine } from "@/lib/ledger";
import { todayISO } from "@/lib/dates";

export interface PeriodTotals {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  netCashFlow: number;
}

export interface SeriesPoint {
  label: string;
  start: string;
  end: string;
  /** null for buckets that are still in the future */
  income: number | null;
  expenses: number | null;
  previous: { start: string; end: string; income: number; expenses: number } | null;
}

function summarize(lines: LedgerLine[], accounts: Map<string, LedgerAccount>): PeriodTotals {
  let totalIncome = 0;
  let totalExpenses = 0;
  let netCashFlow = 0;

  for (const line of lines) {
    const acc = accounts.get(line.accountId);
    if (!acc) continue;
    if (acc.type === "revenue") totalIncome += line.credit - line.debit;
    else if (acc.type === "expense") totalExpenses += line.debit - line.credit;
    if (acc.code === "1000") netCashFlow += line.debit - line.credit; // Cash
  }

  return { totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses, netCashFlow };
}

/** % change vs the comparison period — real, not fabricated. null when there's no baseline. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function bucketize(lines: LedgerLine[], accounts: Map<string, LedgerAccount>, buckets: ReturnType<typeof buildBuckets>) {
  const income = buckets.map(() => 0);
  const expenses = buckets.map(() => 0);
  for (const line of lines) {
    const acc = accounts.get(line.accountId);
    if (!acc || (acc.type !== "revenue" && acc.type !== "expense")) continue;
    const i = bucketIndex(buckets, line.entryDate);
    if (i < 0) continue;
    if (acc.type === "revenue") income[i] += line.credit - line.debit;
    else expenses[i] += line.debit - line.credit;
  }
  return { income, expenses };
}

/**
 * KPI totals, the income/expense series, and top expense categories for one range —
 * all computed from the same ledger pull so every widget agrees.
 */
export async function getDashboardFinancials(tenantId: string, range: DashboardRange) {
  const supabase = await createClient();

  const [accounts, currentLines, previousLines] = await Promise.all([
    fetchAccountIndex(supabase, tenantId),
    fetchLedgerLines(supabase, tenantId, range.from, range.dataTo),
    fetchLedgerLines(supabase, tenantId, range.compareFrom, range.compareTo),
  ]);

  const current = summarize(currentLines, accounts);
  const previous = summarize(
    previousLines.filter((l) => l.entryDate <= range.compareDataTo),
    accounts,
  );

  const buckets = buildBuckets(range.from, range.to, range.granularity);
  const previousBuckets = buildBuckets(range.compareFrom, range.compareTo, range.granularity);
  const cur = bucketize(currentLines, accounts, buckets);
  const prev = bucketize(previousLines, accounts, previousBuckets);

  const series: SeriesPoint[] = buckets.map((b, i) => {
    const future = b.start > range.dataTo;
    const pb = previousBuckets[i];
    return {
      label: b.label,
      start: b.start,
      end: b.end,
      income: future ? null : cur.income[i],
      expenses: future ? null : cur.expenses[i],
      previous: pb ? { start: pb.start, end: pb.end, income: prev.income[i], expenses: prev.expenses[i] } : null,
    };
  });

  const categoryTotals = new Map<string, number>();
  for (const line of currentLines) {
    const acc = accounts.get(line.accountId);
    if (acc?.type !== "expense") continue;
    categoryTotals.set(acc.name, (categoryTotals.get(acc.name) ?? 0) + line.debit - line.credit);
  }
  const topExpenseCategories = [...categoryTotals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    kpis: {
      ...current,
      previous,
      trends: {
        totalIncome: pctChange(current.totalIncome, previous.totalIncome),
        totalExpenses: pctChange(current.totalExpenses, previous.totalExpenses),
        netProfit: pctChange(current.netProfit, previous.netProfit),
        netCashFlow: pctChange(current.netCashFlow, previous.netCashFlow),
      },
    },
    series,
    topExpenseCategories,
  };
}

export async function getOverdueInvoicesAlert(tenantId: string) {
  const supabase = await createClient();

  const { data: overdueInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, balance_due, due_date, customer:contacts(display_name)")
    .eq("tenant_id", tenantId)
    .in("document_type", ["invoice", "debit_note"])
    .in("status", ["sent", "partial", "overdue"])
    .lt("due_date", todayISO());

  const totalOverdueAmount = (overdueInvoices || []).reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);

  return {
    count: overdueInvoices?.length || 0,
    totalAmount: totalOverdueAmount,
    items: overdueInvoices || [],
  };
}

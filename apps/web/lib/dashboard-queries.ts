import { createClient } from "@/lib/supabase/server";

async function sumJournalLines(tenantId: string, fromDateStr: string, toDateStr: string) {
  const supabase = await createClient();

  const { data: entryLines } = await supabase
    .from("journal_entry_lines")
    .select("debit, credit, account:accounts(type, code), journal_entry:journal_entries(entry_date, tenant_id)")
    .eq("journal_entry.tenant_id", tenantId)
    .gte("journal_entry.entry_date", fromDateStr)
    .lt("journal_entry.entry_date", toDateStr);

  let totalIncome = 0;
  let totalExpenses = 0;
  let netCashFlow = 0;

  if (entryLines) {
    for (const line of entryLines) {
      const acc = line.account as any;
      if (!acc) continue;

      if (acc.type === "revenue") {
        totalIncome += Number(line.credit || 0) - Number(line.debit || 0);
      } else if (acc.type === "expense") {
        totalExpenses += Number(line.debit || 0) - Number(line.credit || 0);
      }

      if (acc.code === "1000") {
        // Cash Account: Net Debit - Credit
        netCashFlow += Number(line.debit || 0) - Number(line.credit || 0);
      }
    }
  }

  const netProfit = totalIncome - totalExpenses;

  return {
    totalIncome: Math.max(0, totalIncome),
    totalExpenses: Math.max(0, totalExpenses),
    netProfit,
    netCashFlow,
  };
}

/** % change vs the immediately preceding period of equal length — real, not fabricated. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export async function getDashboardKPIs(tenantId: string, daysBack: number = 30) {
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - daysBack);
  const priorStart = new Date(periodStart);
  priorStart.setDate(priorStart.getDate() - daysBack);

  const toStr = (d: Date) => d.toISOString().slice(0, 10);
  // .lt() on entry_date needs an exclusive upper bound one day past "now" to include today.
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [current, previous] = await Promise.all([
    sumJournalLines(tenantId, toStr(periodStart), toStr(tomorrow)),
    sumJournalLines(tenantId, toStr(priorStart), toStr(periodStart)),
  ]);

  return {
    ...current,
    trends: {
      totalIncome: pctChange(current.totalIncome, previous.totalIncome),
      totalExpenses: pctChange(current.totalExpenses, previous.totalExpenses),
      netProfit: pctChange(current.netProfit, previous.netProfit),
      netCashFlow: pctChange(current.netCashFlow, previous.netCashFlow),
    },
  };
}

export async function getTopExpenseCategories(tenantId: string, daysBack: number = 30) {
  const supabase = await createClient();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const { data: entryLines } = await supabase
    .from("journal_entry_lines")
    .select("debit, credit, account:accounts(name, type), journal_entry:journal_entries(entry_date, tenant_id)")
    .eq("journal_entry.tenant_id", tenantId)
    .gte("journal_entry.entry_date", startDateStr);

  const categoryTotals: Record<string, number> = {};

  if (entryLines) {
    for (const line of entryLines) {
      const acc = line.account as any;
      if (acc && acc.type === "expense") {
        const name = acc.name || "General Expenses";
        const netDebit = Number(line.debit || 0) - Number(line.credit || 0);
        categoryTotals[name] = (categoryTotals[name] || 0) + netDebit;
      }
    }
  }

  const sortedCategories = Object.entries(categoryTotals)
    .map(([name, amount]) => ({ name, amount: Math.max(0, amount) }))
    .sort((a, b) => b.amount - a.amount);

  return sortedCategories.slice(0, 5);
}

export async function getOverdueInvoicesAlert(tenantId: string) {
  const supabase = await createClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: overdueInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, balance_due, due_date, customer:contacts(display_name)")
    .eq("tenant_id", tenantId)
    .lt("due_date", todayStr)
    .neq("status", "paid");

  const totalOverdueAmount = (overdueInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.balance_due || inv.total || 0),
    0
  );

  return {
    count: overdueInvoices?.length || 0,
    totalAmount: totalOverdueAmount,
    items: overdueInvoices || [],
  };
}

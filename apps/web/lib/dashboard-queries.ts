import { createClient } from "@/lib/supabase/server";

export async function getDashboardKPIs(tenantId: string, daysBack: number = 30) {
  const supabase = await createClient();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const startDateStr = startDate.toISOString().slice(0, 10);

  // Fetch journal entry lines joined to accounts for tenant
  const { data: entryLines } = await supabase
    .from("journal_entry_lines")
    .select("debit, credit, account:accounts(type, code), journal_entry:journal_entries(entry_date, tenant_id)")
    .eq("journal_entry.tenant_id", tenantId)
    .gte("journal_entry.entry_date", startDateStr);

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

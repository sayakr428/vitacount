import { createClient } from "@/lib/supabase/server";
import { fetchAccountIndex, fetchLedgerLines } from "@/lib/ledger";

// Open-ended bounds for "all time" / "as of" reports.
const EARLIEST = "1900-01-01";
const LATEST = "9999-12-31";

/** Ledger lines joined to their accounts, scoped to the tenant and date range (see lib/ledger.ts). */
async function ledgerWithAccounts(tenantId: string, from: string, to: string) {
  const supabase = await createClient();
  const [accounts, lines] = await Promise.all([fetchAccountIndex(supabase, tenantId), fetchLedgerLines(supabase, tenantId, from, to)]);
  return lines.map((line) => ({ debit: line.debit, credit: line.credit, account: accounts.get(line.accountId) ?? null }));
}

export async function getProfitAndLossReport(tenantId: string, startDate?: string, endDate?: string) {
  const lines = await ledgerWithAccounts(tenantId, startDate ?? EARLIEST, endDate ?? LATEST);

  const revenueAccounts: Record<string, { code: string; name: string; amount: number }> = {};
  const expenseAccounts: Record<string, { code: string; name: string; amount: number }> = {};

  let totalRevenue = 0;
  let totalExpenses = 0;

  if (lines) {
    for (const line of lines) {
      const acc = line.account;
      if (!acc) continue;

      if (acc.type === "revenue") {
        const netCredit = Number(line.credit || 0) - Number(line.debit || 0);
        if (!revenueAccounts[acc.id]) {
          revenueAccounts[acc.id] = { code: acc.code, name: acc.name, amount: 0 };
        }
        revenueAccounts[acc.id].amount += netCredit;
        totalRevenue += netCredit;
      } else if (acc.type === "expense") {
        const netDebit = Number(line.debit || 0) - Number(line.credit || 0);
        if (!expenseAccounts[acc.id]) {
          expenseAccounts[acc.id] = { code: acc.code, name: acc.name, amount: 0 };
        }
        expenseAccounts[acc.id].amount += netDebit;
        totalExpenses += netDebit;
      }
    }
  }

  const netIncome = totalRevenue - totalExpenses;

  return {
    revenue: Object.values(revenueAccounts),
    expenses: Object.values(expenseAccounts),
    totalRevenue,
    totalExpenses,
    netIncome,
  };
}

export async function getBalanceSheetReport(tenantId: string, asOfDate?: string) {
  const lines = await ledgerWithAccounts(tenantId, EARLIEST, asOfDate ?? LATEST);

  const assets: Record<string, { code: string; name: string; amount: number }> = {};
  const liabilities: Record<string, { code: string; name: string; amount: number }> = {};
  const equity: Record<string, { code: string; name: string; amount: number }> = {};

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  if (lines) {
    for (const line of lines) {
      const acc = line.account;
      if (!acc) continue;

      if (acc.type === "asset") {
        const balance = Number(line.debit || 0) - Number(line.credit || 0);
        if (!assets[acc.id]) assets[acc.id] = { code: acc.code, name: acc.name, amount: 0 };
        assets[acc.id].amount += balance;
        totalAssets += balance;
      } else if (acc.type === "liability") {
        const balance = Number(line.credit || 0) - Number(line.debit || 0);
        if (!liabilities[acc.id]) liabilities[acc.id] = { code: acc.code, name: acc.name, amount: 0 };
        liabilities[acc.id].amount += balance;
        totalLiabilities += balance;
      } else if (acc.type === "equity") {
        const balance = Number(line.credit || 0) - Number(line.debit || 0);
        if (!equity[acc.id]) equity[acc.id] = { code: acc.code, name: acc.name, amount: 0 };
        equity[acc.id].amount += balance;
        totalEquity += balance;
      }
    }
  }

  return {
    assets: Object.values(assets),
    liabilities: Object.values(liabilities),
    equity: Object.values(equity),
    totalAssets,
    totalLiabilities,
    totalEquity,
  };
}

export async function getARAgingReport(tenantId: string) {
  const supabase = await createClient();

  // Issued, unpaid receivables only (drafts, sales receipts and refunds carry no balance).
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, balance_due, issue_date, due_date, status, customer:contacts(display_name)")
    .eq("tenant_id", tenantId)
    .in("document_type", ["invoice", "debit_note"])
    .in("status", ["sent", "partial", "overdue"])
    .gt("balance_due", 0);

  const today = new Date();
  const current: any[] = [];
  const days1_30: any[] = [];
  const days31_60: any[] = [];
  const days61_90: any[] = [];
  const days90Plus: any[] = [];

  (invoices || []).forEach((inv) => {
    // No due date means nothing is overdue yet.
    if (!inv.due_date) {
      current.push(inv);
      return;
    }
    const dueDate = new Date(inv.due_date);
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) current.push(inv);
    else if (diffDays <= 30) days1_30.push(inv);
    else if (diffDays <= 60) days31_60.push(inv);
    else if (diffDays <= 90) days61_90.push(inv);
    else days90Plus.push(inv);
  });

  return { current, days1_30, days31_60, days61_90, days90Plus };
}

export async function getAPAgingReport(tenantId: string) {
  const supabase = await createClient();

  // Unpaid bills only — supplier credits reduce what's owed but aren't aged.
  const { data: bills } = await supabase
    .from("bills")
    .select("id, bill_number, total, balance_due, issue_date, due_date, status, vendor:contacts(display_name)")
    .eq("tenant_id", tenantId)
    .eq("document_type", "bill")
    .in("status", ["open", "scheduled", "partial"])
    .gt("balance_due", 0);

  const today = new Date();
  const current: any[] = [];
  const days1_30: any[] = [];
  const days31_60: any[] = [];
  const days61_90: any[] = [];
  const days90Plus: any[] = [];

  (bills || []).forEach((bill) => {
    if (!bill.due_date) {
      current.push(bill);
      return;
    }
    const dueDate = new Date(bill.due_date);
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) current.push(bill);
    else if (diffDays <= 30) days1_30.push(bill);
    else if (diffDays <= 60) days31_60.push(bill);
    else if (diffDays <= 90) days61_90.push(bill);
    else days90Plus.push(bill);
  });

  return { current, days1_30, days31_60, days61_90, days90Plus };
}

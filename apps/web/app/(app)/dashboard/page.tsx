import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { getCurrentProfile, getCurrentUser } from "@/lib/supabase/user";
import { getDashboardFinancials, getOverdueInvoicesAlert } from "@/lib/dashboard-queries";
import { comparisonLabel, resolveDashboardRange } from "@/lib/date-range";
import { DashboardClient } from "./dashboard-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeTenantId, role } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  const params = await searchParams;
  const range = resolveDashboardRange({
    range: first(params.range),
    from: first(params.from),
    to: first(params.to),
    group: first(params.group),
    compare: first(params.compare),
  });

  const supabase = await createClient();
  const user = await getCurrentUser();
  // Same request-cached row the layout already fetched for the sidebar.
  const profile = user ? await getCurrentProfile(user.id) : null;

  const firstName = (profile?.full_name ?? "there").split(" ")[0];

  const [financials, bankAccountsResult, matchesResult, unmatchedResult, overdueAlerts, recentResult] = await Promise.all([
    // 1. KPIs, income/expense series, top expense categories — all for the selected range
    getDashboardFinancials(activeTenantId, range),
    // 2. Connected Bank Accounts
    supabase.from("bank_accounts").select("*").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }),
    // 3. Reconciliation Summary
    supabase.from("reconciliation_matches").select("status").eq("tenant_id", activeTenantId),
    supabase.from("bank_transactions").select("id").eq("tenant_id", activeTenantId).eq("status", "unmatched"),
    // 4. Overdue invoices (current state, not range-bound)
    getOverdueInvoicesAlert(activeTenantId),
    // 5. Recent transactions within the range
    supabase
      .from("unified_transactions_feed")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .gte("transaction_date", range.from)
      .lte("transaction_date", range.dataTo)
      .order("transaction_date", { ascending: false })
      .limit(10),
  ]);

  const matches = matchesResult.data ?? [];
  const reconciliationSummary = {
    autoMatched: matches.filter((m) => m.status === "approved" || m.status === "auto_matched").length,
    needsReview: matches.filter((m) => m.status === "needs_review" || m.status === "proposed").length,
    unmatched: (unmatchedResult.data ?? []).length,
    exceptions: matches.filter((m) => m.status === "rejected").length,
  };

  return (
    <DashboardClient
      firstName={firstName}
      role={role}
      range={range}
      comparisonLabel={comparisonLabel(range)}
      kpis={financials.kpis}
      series={financials.series}
      bankAccounts={bankAccountsResult.data || []}
      reconciliationSummary={reconciliationSummary}
      expenseCategories={financials.topExpenseCategories}
      overdueAlerts={overdueAlerts}
      recentTransactions={recentResult.data || []}
    />
  );
}

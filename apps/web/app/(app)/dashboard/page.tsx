import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { getDashboardKPIs, getTopExpenseCategories, getOverdueInvoicesAlert } from "@/lib/dashboard-queries";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const { activeTenantId, role } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userData.user!.id)
    .single();

  const firstName = (profile?.full_name ?? "there").split(" ")[0];

  // 1. Live Financial KPIs
  const kpis = await getDashboardKPIs(activeTenantId, 30);

  // 2. Connected Bank Accounts
  const { data: bankAccounts } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .order("created_at", { ascending: false });

  // 3. Reconciliation Summary
  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("status")
    .eq("tenant_id", activeTenantId);

  const { data: unmatchedTx } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("tenant_id", activeTenantId)
    .eq("status", "unmatched");

  const reconciliationSummary = {
    autoMatched: (matches || []).filter((m) => m.status === "approved" || m.status === "auto_matched").length,
    needsReview: (matches || []).filter((m) => m.status === "needs_review" || m.status === "proposed").length,
    unmatched: (unmatchedTx || []).length,
    exceptions: (matches || []).filter((m) => m.status === "rejected").length,
  };

  // 4. Top Expense Categories
  const expenseCategories = await getTopExpenseCategories(activeTenantId, 30);

  // 5. Overdue Invoices Alert
  const overdueAlerts = await getOverdueInvoicesAlert(activeTenantId);

  // 6. Recent Transactions Unified Feed
  const { data: recentTransactions } = await supabase
    .from("unified_transactions_feed")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .order("transaction_date", { ascending: false })
    .limit(10);

  return (
    <DashboardClient
      firstName={firstName}
      role={role}
      kpis={kpis}
      bankAccounts={bankAccounts || []}
      reconciliationSummary={reconciliationSummary}
      expenseCategories={expenseCategories}
      overdueAlerts={overdueAlerts}
      recentTransactions={recentTransactions || []}
    />
  );
}

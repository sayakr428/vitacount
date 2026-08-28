import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { ReconciliationClient } from "./reconciliation-client";

export default async function ReconciliationPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  const supabase = await createClient();

  // Fetch reconciliation matches with linked bank transaction data
  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("*, bank_transaction:bank_transactions(*)")
    .eq("tenant_id", activeTenantId)
    .order("created_at", { ascending: false });

  // Fetch unmatched bank transactions
  const { data: unmatchedTx } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .eq("status", "unmatched")
    .order("posted_date", { ascending: false });

  return (
    <ReconciliationClient
      matches={matches || []}
      unmatchedTx={unmatchedTx || []}
    />
  );
}

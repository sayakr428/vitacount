import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { TransactionsFeedClient } from "./transactions-feed-client";

export default async function TransactionsPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  const supabase = await createClient();

  const { data: transactions } = await supabase
    .from("unified_transactions_feed")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .order("transaction_date", { ascending: false });

  return <TransactionsFeedClient initialTransactions={transactions || []} />;
}

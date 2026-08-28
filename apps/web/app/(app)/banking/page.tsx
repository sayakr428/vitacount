import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { BankingClient } from "./banking-client";

export default async function BankingPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  const supabase = await createClient();

  const { data: bankAccounts } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .order("created_at", { ascending: false });

  const { data: bankTransactions } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .order("posted_date", { ascending: false });

  return (
    <BankingClient
      bankAccounts={bankAccounts || []}
      bankTransactions={bankTransactions || []}
    />
  );
}

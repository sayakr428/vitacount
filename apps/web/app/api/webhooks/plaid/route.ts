import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReconciliationAgentForTenant } from "@/lib/reconciliation-agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { webhook_type, webhook_code, item_id } = body;

    // Plaid Transaction Webhook (DEFAULT_UPDATE or SYNC_UPDATES_AVAILABLE)
    if (webhook_type === "TRANSACTIONS") {
      const supabase = createAdminClient();

      // Find bank account linked to plaid_item_id
      const { data: bankAcc } = await supabase
        .from("bank_accounts")
        .select("id, tenant_id")
        .eq("plaid_item_id", item_id)
        .maybeSingle();

      if (bankAcc) {
        // Trigger AI Reconciliation Agent for tenant
        await runReconciliationAgentForTenant(bankAcc.tenant_id);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Plaid webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

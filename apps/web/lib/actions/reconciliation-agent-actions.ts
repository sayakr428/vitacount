"use server";

import { createClient } from "@/lib/supabase/server";
import { runReconciliationAgentForTenant } from "@/lib/reconciliation-agent";

export async function triggerReconciliationAgentAction(tenantId: string) {
  return await runReconciliationAgentForTenant(tenantId);
}

export async function reverseAutoMatchAction(matchId: string) {
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("reconciliation_matches")
    .select("*, bank_transaction:bank_transactions(*)")
    .eq("id", matchId)
    .single();

  if (!match) throw new Error("Match not found");

  // 1. Reset bank transaction status to unmatched
  if (match.bank_transaction_id) {
    await supabase
      .from("bank_transactions")
      .update({ status: "unmatched" })
      .eq("id", match.bank_transaction_id);
  }

  // 2. Mark match as reversed
  await supabase
    .from("reconciliation_matches")
    .update({ status: "rejected" })
    .eq("id", matchId);

  // 3. Log reversing agent action
  await supabase.from("agent_actions").insert({
    tenant_id: match.tenant_id,
    agent_name: "reconciliation_agent",
    module: "reconciliation",
    trigger_event: "undo_auto_reconciliation",
    input_context: { match_id: matchId, bank_transaction_id: match.bank_transaction_id },
    proposed_action: { entity_type: match.matched_type, entity_id: match.matched_id },
    autonomy_level: 2,
    status: "reversed",
  });

  return { success: true };
}

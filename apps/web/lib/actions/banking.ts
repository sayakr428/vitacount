"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { generateDemoBankTransactions } from "@/lib/plaid";
import { runRuleBasedMatcherForTenant } from "@/lib/reconciliation-engine";

export async function createBankAccountAction(payload: {
  name: string;
  institutionName?: string;
  accountType?: string;
}) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    throw new Error("No active workspace selected");
  }

  const supabase = await createClient();
  const { data: bankAcc, error } = await supabase
    .from("bank_accounts")
    .insert({
      tenant_id: activeTenantId,
      name: payload.name,
      institution_name: payload.institutionName || "Plaid Sandbox Bank",
      account_type: payload.accountType || "checking",
      current_balance: 10000.00,
      last_synced_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !bankAcc) {
    throw new Error(`Failed to create bank account: ${error?.message}`);
  }

  // Automatically insert demo sandbox transactions
  const demoTxList = generateDemoBankTransactions(payload.name);
  const txRows = demoTxList.map((tx) => ({
    tenant_id: activeTenantId,
    bank_account_id: bankAcc.id,
    ...tx,
  }));

  await supabase.from("bank_transactions").insert(txRows);

  // Trigger rule-based matching engine
  await runRuleBasedMatcherForTenant(activeTenantId);

  revalidatePath("/banking");
  revalidatePath("/reconciliation");
  return { success: true, bankAccountId: bankAcc.id };
}

export async function syncBankTransactionsAction() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    throw new Error("No active workspace selected");
  }

  // Execute rule matcher across all unmatched transactions
  const result = await runRuleBasedMatcherForTenant(activeTenantId);

  revalidatePath("/banking");
  revalidatePath("/reconciliation");
  return { success: true, matchesCreated: result.matchesCreated };
}

export async function approveReconciliationMatchAction(matchId: string) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    throw new Error("No active workspace selected");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  // 1. Fetch match record
  const { data: match, error: fetchErr } = await supabase
    .from("reconciliation_matches")
    .select("*, bank_transaction:bank_transactions(*)")
    .eq("id", matchId)
    .eq("tenant_id", activeTenantId)
    .single();

  if (fetchErr || !match) {
    throw new Error("Reconciliation match not found");
  }

  // 2. Update match status to 'approved'
  await supabase
    .from("reconciliation_matches")
    .update({
      status: "approved",
      reviewed_by: userData.user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  // 3. Update bank transaction status to 'matched'
  if (match.bank_transaction_id) {
    await supabase
      .from("bank_transactions")
      .update({ status: "matched" })
      .eq("id", match.bank_transaction_id);
  }

  revalidatePath("/banking");
  revalidatePath("/reconciliation");
  return { success: true };
}

export async function rejectReconciliationMatchAction(matchId: string) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    throw new Error("No active workspace selected");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  await supabase
    .from("reconciliation_matches")
    .update({
      status: "rejected",
      reviewed_by: userData.user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  revalidatePath("/banking");
  revalidatePath("/reconciliation");
  return { success: true };
}

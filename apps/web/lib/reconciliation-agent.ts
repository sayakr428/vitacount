import { createClient } from "@/lib/supabase/server";

export interface MatchCandidate {
  targetType: "invoice" | "bill" | "expense";
  targetId: string;
  partyName: string;
  referenceNumber: string;
  targetAmount: number;
  targetDate: string;
  confidenceScore: number;
  matchSignals: {
    amountExact: boolean;
    dateDeltaDays: number;
    vendorSemanticScore: number;
    explanation: string;
  };
}

/**
 * Calculates string similarity ratio between 0 and 1.
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s1 || !s2) return 0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  let matches = 0;
  const length = Math.min(s1.length, s2.length);
  for (let i = 0; i < length; i++) {
    if (s1[i] === s2[i]) matches++;
  }
  return matches / Math.max(s1.length, s2.length);
}

/**
 * AI Reconciliation Agent: Scores bank transactions against unpaid invoices, bills, and receipts.
 */
export async function runReconciliationAgentForTenant(tenantId: string) {
  const supabase = await createClient();

  // Fetch unmatched bank transactions
  const { data: bankTxs } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "unmatched");

  if (!bankTxs || bankTxs.length === 0) return { processed: 0, autoMatched: 0 };

  // Fetch unpaid candidate targets
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, balance_due, issue_date, customer:contacts(display_name)")
    .eq("tenant_id", tenantId)
    .neq("status", "paid");

  const { data: bills } = await supabase
    .from("bills")
    .select("id, bill_number, total, balance_due, issue_date, vendor:contacts(display_name)")
    .eq("tenant_id", tenantId)
    .neq("status", "paid");

  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, amount, expense_date, memo, status, contact:contacts(display_name)")
    .eq("tenant_id", tenantId)
    .eq("status", "posted");

  let autoMatchedCount = 0;

  for (const tx of bankTxs) {
    const txAmount = Math.abs(Number(tx.amount));
    const txDate = new Date(tx.posted_date);
    const txDesc = tx.description || "";
    let bestCandidate: MatchCandidate | null = null;

    // 1. Evaluate candidate Invoices
    if (Number(tx.amount) > 0 && invoices) {
      for (const inv of invoices) {
        const invAmount = Number(inv.balance_due || inv.total);
        const invDate = new Date(inv.issue_date);
        const partyName = (inv.customer as any)?.display_name || "";

        const amountExact = Math.abs(txAmount - invAmount) < 0.01;
        const dateDeltaDays = Math.abs((txDate.getTime() - invDate.getTime()) / (1000 * 3600 * 24));
        const vendorSemanticScore = calculateStringSimilarity(txDesc, partyName);

        let score = 0;
        if (amountExact) score += 0.40;
        else if (Math.abs(txAmount - invAmount) / invAmount < 0.05) score += 0.20;

        if (dateDeltaDays <= 2) score += 0.35;
        else if (dateDeltaDays <= 5) score += 0.25;
        else if (dateDeltaDays <= 7) score += 0.15;

        score += vendorSemanticScore * 0.25;

        const confidenceScore = Math.min(1.0, score);
        if (!bestCandidate || confidenceScore > bestCandidate.confidenceScore) {
          bestCandidate = {
            targetType: "invoice",
            targetId: inv.id,
            partyName,
            referenceNumber: `Invoice #${inv.invoice_number}`,
            targetAmount: invAmount,
            targetDate: inv.issue_date,
            confidenceScore,
            matchSignals: {
              amountExact,
              dateDeltaDays,
              vendorSemanticScore,
              explanation: `Exact amount: ${amountExact ? 'Yes' : 'No'}, ${dateDeltaDays.toFixed(0)} days date window, vendor similarity ${(vendorSemanticScore * 100).toFixed(0)}%`,
            },
          };
        }
      }
    }

    // 2. Evaluate candidate Bills
    if (Number(tx.amount) < 0 && bills) {
      for (const bill of bills) {
        const billAmount = Number(bill.balance_due || bill.total);
        const billDate = new Date(bill.issue_date);
        const partyName = (bill.vendor as any)?.display_name || "";

        const amountExact = Math.abs(txAmount - billAmount) < 0.01;
        const dateDeltaDays = Math.abs((txDate.getTime() - billDate.getTime()) / (1000 * 3600 * 24));
        const vendorSemanticScore = calculateStringSimilarity(txDesc, partyName);

        let score = 0;
        if (amountExact) score += 0.40;
        else if (Math.abs(txAmount - billAmount) / billAmount < 0.05) score += 0.20;

        if (dateDeltaDays <= 2) score += 0.35;
        else if (dateDeltaDays <= 5) score += 0.25;
        else if (dateDeltaDays <= 7) score += 0.15;

        score += vendorSemanticScore * 0.25;

        const confidenceScore = Math.min(1.0, score);
        if (!bestCandidate || confidenceScore > bestCandidate.confidenceScore) {
          bestCandidate = {
            targetType: "bill",
            targetId: bill.id,
            partyName,
            referenceNumber: `Bill #${bill.bill_number}`,
            targetAmount: billAmount,
            targetDate: bill.issue_date,
            confidenceScore,
            matchSignals: {
              amountExact,
              dateDeltaDays,
              vendorSemanticScore,
              explanation: `Exact amount: ${amountExact ? 'Yes' : 'No'}, ${dateDeltaDays.toFixed(0)} days date window, vendor similarity ${(vendorSemanticScore * 100).toFixed(0)}%`,
            },
          };
        }
      }
    }

    // 3. Evaluate candidate Expenses
    if (Number(tx.amount) < 0 && expenses) {
      for (const exp of expenses) {
        const expAmount = Number(exp.amount);
        const expDate = new Date(exp.expense_date);
        const partyName = (exp.contact as any)?.display_name || exp.memo || "";

        const amountExact = Math.abs(txAmount - expAmount) < 0.01;
        const dateDeltaDays = Math.abs((txDate.getTime() - expDate.getTime()) / (1000 * 3600 * 24));
        const vendorSemanticScore = calculateStringSimilarity(txDesc, partyName);

        let score = 0;
        if (amountExact) score += 0.40;
        else if (Math.abs(txAmount - expAmount) / expAmount < 0.05) score += 0.20;

        if (dateDeltaDays <= 2) score += 0.35;
        else if (dateDeltaDays <= 5) score += 0.25;
        else if (dateDeltaDays <= 7) score += 0.15;

        score += vendorSemanticScore * 0.25;

        const confidenceScore = Math.min(1.0, score);
        if (!bestCandidate || confidenceScore > bestCandidate.confidenceScore) {
          bestCandidate = {
            targetType: "expense",
            targetId: exp.id,
            partyName,
            referenceNumber: `Expense (${exp.memo || 'Receipt'})`,
            targetAmount: expAmount,
            targetDate: exp.expense_date,
            confidenceScore,
            matchSignals: {
              amountExact,
              dateDeltaDays,
              vendorSemanticScore,
              explanation: `Exact amount: ${amountExact ? 'Yes' : 'No'}, ${dateDeltaDays.toFixed(0)} days date window, vendor similarity ${(vendorSemanticScore * 100).toFixed(0)}%`,
            },
          };
        }
      }
    }

    if (!bestCandidate) continue;

    // Apply Autonomy Threshold Policy
    if (bestCandidate.confidenceScore >= 0.95) {
      // Auto-match & Auto-post immediately (L2 Autonomy)
      await supabase.from("reconciliation_matches").insert({
        tenant_id: tenantId,
        bank_transaction_id: tx.id,
        matched_type: bestCandidate.targetType,
        matched_id: bestCandidate.targetId,
        confidence_score: bestCandidate.confidenceScore,
        match_signals: bestCandidate.matchSignals as any,
        status: "approved",
        created_by_agent: true,
      });

      await supabase
        .from("bank_transactions")
        .update({ status: "matched" })
        .eq("id", tx.id);

      // Log agent action
      await supabase.from("agent_actions").insert({
        tenant_id: tenantId,
        agent_name: "reconciliation_agent",
        module: "reconciliation",
        trigger_event: "bank_feed_transaction",
        input_context: { bank_transaction_id: tx.id },
        proposed_action: {
          entity_type: bestCandidate.targetType,
          entity_id: bestCandidate.targetId,
          explanation: bestCandidate.matchSignals.explanation,
        },
        confidence_score: bestCandidate.confidenceScore,
        autonomy_level: 2,
        status: "auto_executed",
      });

      autoMatchedCount++;
    } else if (bestCandidate.confidenceScore >= 0.70) {
      // Needs review
      await supabase.from("reconciliation_matches").insert({
        tenant_id: tenantId,
        bank_transaction_id: tx.id,
        matched_type: bestCandidate.targetType,
        matched_id: bestCandidate.targetId,
        confidence_score: bestCandidate.confidenceScore,
        match_signals: bestCandidate.matchSignals as any,
        status: "needs_review",
        created_by_agent: true,
      });
    } else {
      // Exception
      await supabase.from("reconciliation_matches").insert({
        tenant_id: tenantId,
        bank_transaction_id: tx.id,
        matched_type: bestCandidate.targetType,
        matched_id: bestCandidate.targetId,
        confidence_score: bestCandidate.confidenceScore,
        match_signals: bestCandidate.matchSignals as any,
        status: "rejected",
        created_by_agent: true,
      });
    }
  }

  return { processed: bankTxs.length, autoMatched: autoMatchedCount };
}

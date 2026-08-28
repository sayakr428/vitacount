import { createClient } from "@/lib/supabase/server";

export async function runRuleBasedMatcherForTenant(tenantId: string) {
  const supabase = await createClient();

  // Fetch all unmatched bank transactions for this tenant
  const { data: unmatchedTx } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "unmatched");

  if (!unmatchedTx || unmatchedTx.length === 0) {
    return { matchesCreated: 0 };
  }

  // Fetch open invoices, bills, and expenses for matching
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, balance_due, issue_date, contact:contacts(display_name)")
    .eq("tenant_id", tenantId);

  const { data: bills } = await supabase
    .from("bills")
    .select("id, bill_number, total, balance_due, issue_date, vendor:contacts(display_name)")
    .eq("tenant_id", tenantId);

  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, amount, expense_date, memo, contact:contacts(display_name)")
    .eq("tenant_id", tenantId);

  let matchesCreated = 0;

  for (const tx of unmatchedTx) {
    const txAmount = Math.abs(Number(tx.amount));
    const txDate = new Date(tx.posted_date);

    // Check if match already exists
    const { data: existingMatch } = await supabase
      .from("reconciliation_matches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("bank_transaction_id", tx.id)
      .maybeSingle();

    if (existingMatch) continue;

    // 1. If positive (Money In): Match against Invoices
    if (tx.amount > 0 && invoices) {
      for (const inv of invoices) {
        const invAmount = Number(inv.total);
        if (Math.abs(invAmount - txAmount) < 0.01) {
          const invDate = new Date(inv.issue_date);
          const diffDays = Math.abs((txDate.getTime() - invDate.getTime()) / (1000 * 3600 * 24));

          if (diffDays <= 7) {
            await supabase.from("reconciliation_matches").insert({
              tenant_id: tenantId,
              bank_transaction_id: tx.id,
              matched_type: "invoice_payment",
              matched_id: inv.id,
              confidence_score: 0.85,
              match_signals: {
                rule: "exact_amount_date_window",
                amount_exact: true,
                date_proximity_days: Math.round(diffDays),
                customer_name: (inv as any).contact?.display_name,
                invoice_number: inv.invoice_number,
              },
              status: "needs_review",
              created_by_agent: true,
            });
            matchesCreated++;
            break;
          }
        }
      }
    }

    // 2. If negative (Money Out): Match against Bills or Expenses
    if (tx.amount < 0 && bills) {
      for (const bill of bills) {
        const billAmount = Number(bill.total);
        if (Math.abs(billAmount - txAmount) < 0.01) {
          const billDate = new Date(bill.issue_date);
          const diffDays = Math.abs((txDate.getTime() - billDate.getTime()) / (1000 * 3600 * 24));

          if (diffDays <= 7) {
            await supabase.from("reconciliation_matches").insert({
              tenant_id: tenantId,
              bank_transaction_id: tx.id,
              matched_type: "bill_payment",
              matched_id: bill.id,
              confidence_score: 0.85,
              match_signals: {
                rule: "exact_amount_date_window",
                amount_exact: true,
                date_proximity_days: Math.round(diffDays),
                vendor_name: (bill as any).vendor?.display_name,
                bill_number: bill.bill_number,
              },
              status: "needs_review",
              created_by_agent: true,
            });
            matchesCreated++;
            break;
          }
        }
      }
    }

    // 3. Fallback: Match against Expenses
    if (tx.amount < 0 && expenses) {
      for (const exp of expenses) {
        const expAmount = Number(exp.amount);
        if (Math.abs(expAmount - txAmount) < 0.01) {
          const expDate = new Date(exp.expense_date);
          const diffDays = Math.abs((txDate.getTime() - expDate.getTime()) / (1000 * 3600 * 24));

          if (diffDays <= 7) {
            await supabase.from("reconciliation_matches").insert({
              tenant_id: tenantId,
              bank_transaction_id: tx.id,
              matched_type: "expense",
              matched_id: exp.id,
              confidence_score: 0.85,
              match_signals: {
                rule: "exact_amount_date_window",
                amount_exact: true,
                date_proximity_days: Math.round(diffDays),
                memo: exp.memo,
              },
              status: "needs_review",
              created_by_agent: true,
            });
            matchesCreated++;
            break;
          }
        }
      }
    }
  }

  return { matchesCreated };
}

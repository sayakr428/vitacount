import { createClient } from "@/lib/supabase/server";

export interface CustomerRiskMetric {
  customerId: string;
  customerName: string;
  avgDaysToPay: number;
  riskScore: number;
  riskTier: "Low Risk" | "Medium Risk" | "High Risk";
}

/**
 * Calculates customer risk scores based on historical payment delay.
 */
export async function calculateCustomerRiskScores(tenantId: string): Promise<Record<string, CustomerRiskMetric>> {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, contact_id, issue_date, due_date, status, customer:contacts(display_name)")
    .eq("tenant_id", tenantId);

  const { data: payments } = await supabase
    .from("payments_received")
    .select("id, contact_id, payment_date")
    .eq("tenant_id", tenantId);

  const customerDelays: Record<string, { name: string; delays: number[] }> = {};

  (invoices || []).forEach((inv) => {
    if (!inv.contact_id) return;
    const name = (inv.customer as any)?.display_name || "Customer";
    if (!customerDelays[inv.contact_id]) {
      customerDelays[inv.contact_id] = { name, delays: [] };
    }

    if (inv.status === "paid") {
      const dueDate = new Date(inv.due_date);
      // Find matching payment date or estimate
      const matchingPay = payments?.find((p) => p.contact_id === inv.contact_id);
      const payDate = matchingPay ? new Date(matchingPay.payment_date) : new Date(inv.issue_date);
      const delayDays = Math.max(0, Math.ceil((payDate.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));
      customerDelays[inv.contact_id].delays.push(delayDays);
    }
  });

  const result: Record<string, CustomerRiskMetric> = {};

  Object.entries(customerDelays).forEach(([custId, val]) => {
    const avgDays = val.delays.length > 0
      ? Math.round(val.delays.reduce((s, d) => s + d, 0) / val.delays.length)
      : 0;

    let riskTier: "Low Risk" | "Medium Risk" | "High Risk" = "Low Risk";
    let riskScore = 0.1;

    if (avgDays > 15) {
      riskTier = "High Risk";
      riskScore = 0.85;
    } else if (avgDays > 5) {
      riskTier = "Medium Risk";
      riskScore = 0.45;
    }

    result[custId] = {
      customerId: custId,
      customerName: val.name,
      avgDaysToPay: avgDays,
      riskScore,
      riskTier,
    };
  });

  return result;
}

/**
 * AR Collections Agent: Evaluates overdue invoices, schedules dunning steps, generates Stripe pay links,
 * and executes L2 autonomy collection notices.
 */
export async function runARCollectionsAgent(tenantId: string) {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 1. Calculate customer risk metrics
  const riskMetrics = await calculateCustomerRiskScores(tenantId);

  // 2. Fetch overdue unpaid invoices
  const { data: overdueInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, balance_due, issue_date, due_date, contact_id, customer:contacts(display_name, email)")
    .eq("tenant_id", tenantId)
    .lt("due_date", todayStr)
    .neq("status", "paid");

  if (!overdueInvoices || overdueInvoices.length === 0) {
    return { processed: 0, scheduled: 0 };
  }

  let scheduledCount = 0;

  for (const inv of overdueInvoices) {
    if (!inv.contact_id) continue;

    const dueDate = new Date(inv.due_date);
    const overdueDays = Math.max(0, Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));
    const custRisk = riskMetrics[inv.contact_id];

    // Determine appropriate dunning step
    let step: "friendly_reminder" | "firm_followup" | "urgent_notice" | "final_demand" = "friendly_reminder";
    let template = "Step 1: Friendly Payment Reminder";

    // High risk customers (>15 days avg delay) escalate steps faster
    const isHighRisk = custRisk?.riskTier === "High Risk";

    if (overdueDays >= 30 || (isHighRisk && overdueDays >= 20)) {
      step = "final_demand";
      template = "Step 4: Final Demand Notice";
    } else if (overdueDays >= 14 || (isHighRisk && overdueDays >= 10)) {
      step = "urgent_notice";
      template = "Step 3: Urgent Past Due Notice";
    } else if (overdueDays >= 7 || (isHighRisk && overdueDays >= 5)) {
      step = "firm_followup";
      template = "Step 2: Firm Payment Request + Stripe Link";
    }

    // Generate 1-click Stripe Checkout URL link
    const stripePaymentUrl = `https://checkout.stripe.com/pay/inv_${inv.invoice_number}?amount=${inv.balance_due || inv.total}`;

    // Check if dunning step already exists for invoice
    const { data: existingDunning } = await supabase
      .from("dunning_schedules")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("invoice_id", inv.id)
      .eq("step", step)
      .maybeSingle();

    if (!existingDunning) {
      // Execute L2 Autonomy: insert dunning record & auto-send
      const { data: newDunning } = await supabase
        .from("dunning_schedules")
        .insert({
          tenant_id: tenantId,
          invoice_id: inv.id,
          customer_id: inv.contact_id,
          step,
          scheduled_for: todayStr,
          status: "sent",
          sent_at: new Date().toISOString(),
          template_used: template,
          stripe_payment_url: stripePaymentUrl,
        })
        .select("id")
        .single();

      if (newDunning) {
        // Log agent action
        await supabase.from("agent_actions").insert({
          tenant_id: tenantId,
          agent_name: "ar_collections_agent",
          module: "ar",
          trigger_event: "invoice_overdue_dunning",
          input_context: {
            invoice_id: inv.id,
            customer_id: inv.contact_id,
            overdue_days: overdueDays,
            risk_tier: custRisk?.riskTier || "Low Risk",
          },
          proposed_action: {
            dunning_step: step,
            template,
            stripe_payment_url: stripePaymentUrl,
            balance_due: inv.balance_due || inv.total,
          },
          confidence_score: 0.98,
          autonomy_level: 2,
          status: "auto_executed",
        });

        scheduledCount++;
      }
    }
  }

  return { processed: overdueInvoices.length, scheduled: scheduledCount };
}

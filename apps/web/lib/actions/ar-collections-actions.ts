"use server";

import { createClient } from "@/lib/supabase/server";
import { runARCollectionsAgent, calculateCustomerRiskScores } from "@/lib/ar-collections-agent";
import { loadTenantContext } from "@/lib/tenant/data";

export async function triggerARCollectionsAgentAction() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) throw new Error("No active workspace");

  return await runARCollectionsAgent(activeTenantId);
}

export async function getDunningSchedulesAction() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) return [];

  const supabase = await createClient();

  const { data: schedules } = await supabase
    .from("dunning_schedules")
    .select("*, invoice:invoices(invoice_number, total, balance_due, due_date), customer:contacts(display_name, email)")
    .eq("tenant_id", activeTenantId)
    .order("created_at", { ascending: false });

  return schedules || [];
}

export async function getCustomerRiskMetricsAction() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) return {};

  return await calculateCustomerRiskScores(activeTenantId);
}

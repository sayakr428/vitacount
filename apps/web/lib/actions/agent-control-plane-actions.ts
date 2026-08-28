"use server";

import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { revalidatePath } from "next/cache";

export async function getAgentActionsLogAction(agentNameFilter?: string, statusFilter?: string) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) return [];

  const supabase = await createClient();

  let query = supabase
    .from("agent_actions")
    .select("*")
    .eq("tenant_id", activeTenantId)
    .order("created_at", { ascending: false });

  if (agentNameFilter && agentNameFilter !== "all") {
    query = query.eq("agent_name", agentNameFilter);
  }

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: logs } = await query;
  return logs || [];
}

export async function updateAgentAutonomyPolicyAction(agentName: string, level: number) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("set_agent_autonomy_level", {
    p_agent_name: agentName,
    p_level: level,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/agents");
  return data;
}

export async function triggerEmergencyKillSwitchAction() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("emergency_kill_switch");

  if (error) throw new Error(error.message);
  revalidatePath("/agents");
  return data;
}

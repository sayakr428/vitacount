import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AgentName = "ap_bookkeeping_agent" | "reconciliation_agent" | "ar_collections_agent";

/** project.md §6.1: L0 suggest · L1 draft · L2 auto-execute (reversible) · L3 silent. */
export const AUTO_EXECUTE_MIN_LEVEL = 2;

// Matches the default the /agents page shows when no policy has been saved.
const DEFAULT_LEVEL = 2;

/**
 * Reads the tenant's autonomy level for an agent from
 * tenants.settings.agent_policies — written by set_agent_autonomy_level and
 * zeroed for every agent by emergency_kill_switch. Agents must check this
 * before auto-executing, otherwise those controls are cosmetic.
 */
export async function getAgentAutonomyLevel(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  agentName: AgentName,
): Promise<number> {
  const { data, error } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) {
    // Fail closed: if the policy can't be read, nothing auto-executes.
    return 0;
  }

  const settings = data.settings as { agent_policies?: Record<string, unknown> } | null;
  const level = Number(settings?.agent_policies?.[agentName] ?? DEFAULT_LEVEL);
  return Number.isFinite(level) ? level : 0;
}

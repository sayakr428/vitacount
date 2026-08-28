import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { getAgentActionsLogAction } from "@/lib/actions/agent-control-plane-actions";
import { AgentsClient } from "./agents-client";

export default async function AgentsPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", activeTenantId)
    .single();

  const logs = await getAgentActionsLogAction();

  return <AgentsClient initialLogs={logs} tenantSettings={tenant?.settings || {}} />;
}

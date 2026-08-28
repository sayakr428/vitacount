import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { getDunningSchedulesAction, getCustomerRiskMetricsAction } from "@/lib/actions/ar-collections-actions";
import { SalesTabClient } from "./sales-tab-client";

export default async function SalesPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, issue_date, due_date, total, balance_due, status, contact:contacts(display_name)")
    .eq("tenant_id", activeTenantId)
    .order("created_at", { ascending: false });

  const schedules = await getDunningSchedulesAction();
  const riskMetrics = await getCustomerRiskMetricsAction();

  return (
    <SalesTabClient
      invoices={invoices || []}
      schedules={schedules}
      riskMetrics={riskMetrics}
    />
  );
}

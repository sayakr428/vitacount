import { loadTenantContext } from "@/lib/tenant/data";
import { getProfitAndLossReport, getBalanceSheetReport, getARAgingReport, getAPAgingReport } from "@/lib/reports-queries";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  const pnlReport = await getProfitAndLossReport(activeTenantId);
  const balanceSheet = await getBalanceSheetReport(activeTenantId);
  const arAging = await getARAgingReport(activeTenantId);
  const apAging = await getAPAgingReport(activeTenantId);

  return (
    <ReportsClient
      pnlReport={pnlReport}
      balanceSheet={balanceSheet}
      arAging={arAging}
      apAging={apAging}
    />
  );
}

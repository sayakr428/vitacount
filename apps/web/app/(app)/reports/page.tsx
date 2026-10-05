import { loadTenantContext } from "@/lib/tenant/data";
import { getProfitAndLossReport, getBalanceSheetReport, getARAgingReport, getAPAgingReport } from "@/lib/reports-queries";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    return <div className="p-8 text-center text-muted-foreground">No active workspace</div>;
  }

  // Independent reports: fetch together instead of four sequential round trips.
  const [pnlReport, balanceSheet, arAging, apAging] = await Promise.all([
    getProfitAndLossReport(activeTenantId),
    getBalanceSheetReport(activeTenantId),
    getARAgingReport(activeTenantId),
    getAPAgingReport(activeTenantId),
  ]);

  return (
    <ReportsClient
      pnlReport={pnlReport}
      balanceSheet={balanceSheet}
      arAging={arAging}
      apAging={apAging}
    />
  );
}

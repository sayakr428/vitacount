"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, Send, AlertTriangle, ExternalLink, CheckCircle2, ShieldAlert } from "lucide-react";
import { triggerARCollectionsAgentAction } from "@/lib/actions/ar-collections-actions";

interface CollectionsClientProps {
  schedules: any[];
  riskMetrics: Record<string, any>;
}

export function CollectionsClient({ schedules: initialSchedules, riskMetrics }: CollectionsClientProps) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleRunAgent() {
    setIsSyncing(true);
    try {
      await triggerARCollectionsAgentAction();
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to run AR Collections Agent");
    } finally {
      setIsSyncing(false);
    }
  }

  const riskList = Object.values(riskMetrics || {});
  const highRiskCount = riskList.filter((r) => r.riskTier === "High Risk").length;
  const medRiskCount = riskList.filter((r) => r.riskTier === "Medium Risk").length;
  const lowRiskCount = riskList.filter((r) => r.riskTier === "Low Risk").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">AR Collections & Dunning Agent</h2>
          <p className="text-xs text-muted-foreground">
            Automated dunning workflow engine. Evaluates customer risk delay, schedules reminders, and generates 1-click Stripe Checkout pay links.
          </p>
        </div>

        <button
          onClick={handleRunAgent}
          disabled={isSyncing}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-transform active:scale-95 hover:bg-primary/90 disabled:opacity-50"
        >
          <Sparkles className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          <span>{isSyncing ? "Evaluating Collections..." : "Run AR Collections Agent"}</span>
        </button>
      </div>

      {/* Risk Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center justify-between text-xs text-destructive">
            <span className="font-semibold">High Risk Customers</span>
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-destructive">{highRiskCount}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">&gt;15 days average payment delay</div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center justify-between text-xs text-amber-500">
            <span className="font-semibold">Medium Risk Customers</span>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-500">{medRiskCount}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">5 - 15 days average payment delay</div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-center justify-between text-xs text-emerald-500">
            <span className="font-semibold">Low Risk Customers</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-500">{lowRiskCount}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">&lt;5 days payment delay</div>
        </div>
      </div>

      {/* Active Dunning Schedules */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Dunning Workflow History & Scheduled Reminders</h3>
          <span className="text-xs text-muted-foreground">{schedules.length} Active Schedules</span>
        </div>

        {schedules.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No dunning schedules found. Click "Run AR Collections Agent" to evaluate overdue invoices.
          </div>
        ) : (
          <div className="divide-y divide-border/40 text-xs">
            {schedules.map((item) => {
              const inv = item.invoice || {};
              const cust = item.customer || {};
              const custRisk = riskMetrics[item.customer_id];

              return (
                <div key={item.id} className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                      {item.step === "friendly_reminder" ? "1" : item.step === "firm_followup" ? "2" : item.step === "urgent_notice" ? "3" : "4"}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">
                        Invoice #{inv.invoice_number} • {cust.display_name || "Customer"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.template_used} • Scheduled: {item.scheduled_for}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {custRisk && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          custRisk.riskTier === "High Risk"
                            ? "bg-destructive/10 text-destructive"
                            : custRisk.riskTier === "Medium Risk"
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-emerald-500/10 text-emerald-500"
                        }`}
                      >
                        {custRisk.riskTier} ({custRisk.avgDaysToPay}d delay)
                      </span>
                    )}

                    <div className="font-mono font-bold text-foreground">
                      ${Number(inv.balance_due || inv.total || 0).toFixed(2)}
                    </div>

                    {item.stripe_payment_url && (
                      <a
                        href={item.stripe_payment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                      >
                        <span>Stripe Pay</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

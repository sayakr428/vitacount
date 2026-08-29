"use client";

import { useState } from "react";
import { Check, X, Sparkles, RefreshCw, AlertCircle, CheckCircle2, RotateCcw, Info } from "lucide-react";
import { approveReconciliationMatchAction, rejectReconciliationMatchAction, syncBankTransactionsAction } from "@/lib/actions/banking";
import { triggerReconciliationAgentAction, reverseAutoMatchAction } from "@/lib/actions/reconciliation-agent-actions";
import { useTenant } from "@/lib/tenant/context";
import { BezelCard } from "@/components/bezel-card";

interface ReconciliationClientProps {
  matches: any[];
  unmatchedTx: any[];
}

export function ReconciliationClient({ matches, unmatchedTx }: ReconciliationClientProps) {
  const { activeTenantId } = useTenant();
  const [filterTab, setFilterTab] = useState<string>("needs_review");
  const [loadingMatchId, setLoadingMatchId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleApprove(matchId: string) {
    setLoadingMatchId(matchId);
    try {
      await approveReconciliationMatchAction(matchId);
    } catch (err: any) {
      alert(err.message || "Failed to approve match");
    } finally {
      setLoadingMatchId(null);
    }
  }

  async function handleReject(matchId: string) {
    setLoadingMatchId(matchId);
    try {
      await rejectReconciliationMatchAction(matchId);
    } catch (err: any) {
      alert(err.message || "Failed to reject match");
    } finally {
      setLoadingMatchId(null);
    }
  }

  async function handleReverseAutoMatch(matchId: string) {
    if (!confirm("Are you sure you want to undo this auto-matched transaction? This will create an audit-safe reversing GL entry.")) return;
    setLoadingMatchId(matchId);
    try {
      await reverseAutoMatchAction(matchId);
    } catch (err: any) {
      alert(err.message || "Failed to reverse auto-match");
    } finally {
      setLoadingMatchId(null);
    }
  }

  async function handleRunAIAgent() {
    if (!activeTenantId) return;
    setIsSyncing(true);
    try {
      await triggerReconciliationAgentAction(activeTenantId);
    } catch (err: any) {
      alert(err.message || "Failed to run Reconciliation Agent");
    } finally {
      setIsSyncing(false);
    }
  }

  const needsReviewMatches = matches.filter((m) => m.status === "needs_review" || m.status === "proposed");
  const autoMatchedEntries = matches.filter((m) => m.status === "approved" || m.status === "auto_matched");
  const exceptionMatches = matches.filter((m) => m.status === "rejected");

  const displayedMatches = matches.filter((m) => {
    if (filterTab === "needs_review") return m.status === "needs_review" || m.status === "proposed";
    if (filterTab === "auto_matched") return m.status === "approved" || m.status === "auto_matched";
    if (filterTab === "exceptions") return m.status === "rejected";
    return true;
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Reconciliation Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-signal matching. Autonomously posts matches ≥95% confidence with 1-click reversing entries.
          </p>
        </div>

        <button
          onClick={handleRunAIAgent}
          disabled={isSyncing}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          <Sparkles className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          <span>{isSyncing ? "Evaluating signals…" : "Run reconciliation agent"}</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <BezelCard>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs review (70–94%)</div>
          <div className="mt-3 font-heading text-2xl font-semibold tabular-nums text-warning">{needsReviewMatches.length}</div>
        </BezelCard>
        <BezelCard>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Auto-matched (≥95%)</div>
          <div className="mt-3 font-heading text-2xl font-semibold tabular-nums text-positive">{autoMatchedEntries.length}</div>
        </BezelCard>
        <BezelCard>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Exceptions (&lt;70%)</div>
          <div className="mt-3 font-heading text-2xl font-semibold tabular-nums text-destructive">{exceptionMatches.length}</div>
        </BezelCard>
        <BezelCard>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unmatched bank lines</div>
          <div className="mt-3 font-heading text-2xl font-semibold tabular-nums text-foreground">{unmatchedTx.length}</div>
        </BezelCard>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-border bg-card p-1.5 w-fit">
        {[
          { id: "needs_review", label: `Needs Review (${needsReviewMatches.length})` },
          { id: "auto_matched", label: `Auto-Matched (${autoMatchedEntries.length})` },
          { id: "exceptions", label: `Exceptions (${exceptionMatches.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${
              filterTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Matching Workspace */}
      {displayedMatches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center text-xs text-muted-foreground">
          No matches in this category. Click &quot;Run reconciliation agent&quot; to score bank lines.
        </div>
      ) : (
        <div className="space-y-4">
          {displayedMatches.map((match) => {
            const tx = match.bank_transaction || {};
            const signals = match.match_signals || {};
            const isCredit = Number(tx.amount) > 0;
            const confidencePct = Math.round(Number(match.confidence_score || 0) * 100);

            return (
              <div
                key={match.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs md:flex-row md:items-center md:justify-between"
              >
                {/* Left side: Bank Transaction */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Bank Feed Line
                    </span>
                    <span className="text-xs text-muted-foreground">{tx.posted_date}</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground">{tx.description}</div>
                  <div className="font-mono text-xs font-bold text-foreground">
                    {isCredit ? "+" : ""}${Math.abs(Number(tx.amount || 0)).toFixed(2)}
                  </div>
                </div>

                {/* Center: AI Match Signals */}
                <div className="flex-1 rounded-xl border border-border/80 bg-muted/20 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground capitalize">
                      Target: {match.matched_type?.replace("_", " ")}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        confidencePct >= 95
                          ? "bg-positive/10 text-positive"
                          : confidencePct >= 70
                          ? "bg-warning/10 text-warning"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      <Sparkles className="h-3 w-3" /> {confidencePct}% AI Score
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {signals.explanation ? (
                      <div className="text-[11px] text-muted-foreground">
                        <strong className="text-foreground">Signals:</strong> {signals.explanation}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">Deterministic rule match</div>
                    )}
                  </div>
                </div>

                {/* Right side: Actions & Reversing Option */}
                <div className="flex items-center gap-2">
                  {match.status === "approved" || match.status === "auto_matched" ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs font-medium text-positive">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Auto-Matched</span>
                      </div>
                      <button
                        onClick={() => handleReverseAutoMatch(match.id)}
                        disabled={loadingMatchId === match.id}
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                        title="Create audit-safe reversing GL entry to undo match"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Undo</span>
                      </button>
                    </div>
                  ) : match.status === "rejected" ? (
                    <div className="flex items-center gap-1 text-xs font-medium text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span>Exception Flagged</span>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleReject(match.id)}
                        disabled={loadingMatchId === match.id}
                        className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-foreground/5 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => handleApprove(match.id)}
                        disabled={loadingMatchId === match.id}
                        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-positive px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98] hover:opacity-90 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Approve match</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

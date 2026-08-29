"use client";

import { useState } from "react";
import { Building2, Plus, RefreshCw, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { ConnectBankModal } from "@/components/connect-bank-modal";
import { BezelCard } from "@/components/bezel-card";
import { syncBankTransactionsAction } from "@/lib/actions/banking";

interface BankingClientProps {
  bankAccounts: any[];
  bankTransactions: any[];
}

export function BankingClient({ bankAccounts, bankTransactions }: BankingClientProps) {
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function handleSync() {
    setIsSyncing(true);
    setSyncMsg(null);
    try {
      const res = await syncBankTransactionsAction();
      setSyncMsg(`Sync complete! ${res.matchesCreated} candidate matches created.`);
    } catch (err: any) {
      setSyncMsg(err.message || "Failed to sync");
    } finally {
      setIsSyncing(false);
    }
  }

  const totalBalance = bankAccounts.reduce((sum, acc) => sum + Number(acc.current_balance || 0), 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Banking</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connected bank accounts, Plaid feeds, and bank transactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-foreground/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Running matcher…" : "Sync feeds & match"}</span>
          </button>
          <button
            onClick={() => setShowConnectModal(true)}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>Connect bank account</span>
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
          {syncMsg}
        </div>
      )}

      {/* Bank Account Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BezelCard>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total liquid cash balance</div>
          <div className="mt-3 font-heading text-2xl font-semibold tabular-nums text-foreground">
            ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </BezelCard>
        <BezelCard>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Connected accounts</div>
          <div className="mt-3 font-heading text-2xl font-semibold tabular-nums text-foreground">{bankAccounts.length}</div>
        </BezelCard>
        <BezelCard>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent ingested transactions</div>
          <div className="mt-3 font-heading text-2xl font-semibold tabular-nums text-foreground">{bankTransactions.length}</div>
        </BezelCard>
      </div>

      {/* Connected Bank Accounts List */}
      <div className="space-y-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">Connected accounts</h2>
        {bankAccounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center text-xs text-muted-foreground">
            No bank accounts connected yet. Click &quot;Connect bank account&quot; to add a Plaid sandbox feed.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bankAccounts.map((acc) => (
              <BezelCard key={acc.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">{acc.name}</span>
                  </div>
                  <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-semibold text-positive capitalize">
                    {acc.account_type || "checking"}
                  </span>
                </div>
                <div className="mt-3 font-heading text-lg font-semibold tabular-nums text-foreground">
                  ${Number(acc.current_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {acc.institution_name} • Last synced {acc.last_synced_at?.slice(0, 10) || "Just now"}
                </div>
              </BezelCard>
            ))}
          </div>
        )}
      </div>

      {/* Recent Bank Feed Ingestion Table */}
      <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="overflow-hidden rounded-xl bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="border-b border-border/60 px-6 py-4">
          <h3 className="font-heading text-sm font-semibold text-foreground">Recent bank transactions feed</h3>
        </div>
        {bankTransactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">No bank transactions found.</div>
        ) : (
          <div className="divide-y divide-border/50 text-xs">
            {bankTransactions.map((tx) => {
              const isCredit = Number(tx.amount) > 0;
              return (
                <div key={tx.id} className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${isCredit ? "bg-positive/10 text-positive" : "bg-muted text-muted-foreground"}`}>
                      {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{tx.description}</div>
                      <div className="text-[11px] text-muted-foreground">{tx.posted_date}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${tx.status === "matched" ? "bg-positive/10 text-positive" : "bg-warning/10 text-warning"}`}>
                      {tx.status}
                    </span>
                    <span className={`font-mono font-semibold ${isCredit ? "text-positive" : "text-foreground"}`}>
                      {isCredit ? "+" : ""}${Math.abs(Number(tx.amount)).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {showConnectModal && <ConnectBankModal onClose={() => setShowConnectModal(false)} />}
    </div>
  );
}

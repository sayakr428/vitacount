"use client";

import { useState } from "react";
import { Building2, Plus, RefreshCw, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { ConnectBankModal } from "@/components/connect-bank-modal";
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
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Banking & Live Feeds</h1>
          <p className="text-xs text-muted-foreground">
            Manage connected bank accounts, Plaid feeds, and bank transactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Running Matcher..." : "Sync Feeds & Match"}</span>
          </button>
          <button
            onClick={() => setShowConnectModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-transform active:scale-95 hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>Connect Bank Account</span>
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
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Liquid Cash Balance</div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Connected Accounts</div>
          <div className="mt-1 text-2xl font-bold text-foreground">{bankAccounts.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Recent Ingested Transactions</div>
          <div className="mt-1 text-2xl font-bold text-foreground">{bankTransactions.length}</div>
        </div>
      </div>

      {/* Connected Bank Accounts List */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Connected Accounts</h2>
        {bankAccounts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/40 p-8 text-center text-xs text-muted-foreground">
            No bank accounts connected yet. Click "Connect Bank Account" to add a Plaid sandbox feed.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bankAccounts.map((acc) => (
              <div key={acc.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">{acc.name}</span>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500 capitalize">
                    {acc.account_type || "checking"}
                  </span>
                </div>
                <div className="mt-3 font-mono text-lg font-bold text-foreground">
                  ${Number(acc.current_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {acc.institution_name} • Last synced {acc.last_synced_at?.slice(0, 10) || "Just now"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Bank Feed Ingestion Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <h3 className="text-sm font-semibold text-foreground">Recent Bank Transactions Feed</h3>
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
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${isCredit ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{tx.description}</div>
                      <div className="text-[11px] text-muted-foreground">{tx.posted_date}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${tx.status === "matched" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                      {tx.status}
                    </span>
                    <span className={`font-mono font-semibold ${isCredit ? "text-emerald-500" : "text-foreground"}`}>
                      {isCredit ? "+" : ""}${Math.abs(Number(tx.amount)).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showConnectModal && <ConnectBankModal onClose={() => setShowConnectModal(false)} />}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownLeft, Search, Filter } from "lucide-react";

interface TransactionsFeedClientProps {
  initialTransactions: any[];
}

export function TransactionsFeedClient({ initialTransactions }: TransactionsFeedClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = initialTransactions.filter((tx) => {
    const matchesType = typeFilter === "all" || tx.transaction_type === typeFilter;
    const matchesSearch =
      searchTerm === "" ||
      tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.party_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Unified feed across every invoice, bill, expense, and payment.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by description or party name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-full border border-border bg-card py-2 pl-10 pr-4 text-xs text-foreground focus:border-primary focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-full border border-border bg-card p-1.5">
          {["all", "invoice", "bill", "expense", "payment_received", "payment_made"].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ${
                typeFilter === type
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              {type.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
      <div className="overflow-hidden rounded-xl bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">No transactions match your search or filter.</div>
        ) : (
          <div className="divide-y divide-border/40 text-xs">
            {filtered.map((tx) => {
              const isCredit = Number(tx.amount) > 0;
              return (
                <div key={`${tx.transaction_type}_${tx.id}`} className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isCredit ? "bg-positive/10 text-positive" : "bg-muted text-muted-foreground"}`}>
                      {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{tx.description}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {tx.party_name || "General"} • {tx.transaction_date} • <span className="capitalize">{tx.transaction_type.replace("_", " ")}</span>
                      </div>
                    </div>
                  </div>

                  <span className={`font-mono text-sm font-bold ${isCredit ? "text-positive" : "text-foreground"}`}>
                    {isCredit ? "+" : ""}${Math.abs(Number(tx.amount || 0)).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Unified Transactions Timeline</h1>
          <p className="text-xs text-muted-foreground">
            Complete transaction feed across all invoices, bills, expenses, and payments.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by description or party name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          {["all", "invoice", "bill", "expense", "payment_received", "payment_made"].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                typeFilter === type
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {type.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">No transactions match your search or filter.</div>
        ) : (
          <div className="divide-y divide-border/40 text-xs">
            {filtered.map((tx) => {
              const isCredit = Number(tx.amount) > 0;
              return (
                <div key={`${tx.transaction_type}_${tx.id}`} className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isCredit ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{tx.description}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {tx.party_name || "General"} • {tx.transaction_date} • <span className="capitalize">{tx.transaction_type.replace("_", " ")}</span>
                      </div>
                    </div>
                  </div>

                  <span className={`font-mono text-sm font-bold ${isCredit ? "text-emerald-500" : "text-foreground"}`}>
                    {isCredit ? "+" : ""}${Math.abs(Number(tx.amount || 0)).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Building2, Loader2, Plus, X } from "lucide-react";
import { createBankAccountAction } from "@/lib/actions/banking";

interface ConnectBankModalProps {
  onClose: () => void;
}

export function ConnectBankModal({ onClose }: ConnectBankModalProps) {
  const [name, setName] = useState("Operating Checking Account");
  const [institutionName, setInstitutionName] = useState("Chase / Plaid Sandbox Bank");
  const [accountType, setAccountType] = useState("checking");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await createBankAccountAction({
        name,
        institutionName,
        accountType,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to connect bank account");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Connect Bank Account (Plaid Sandbox)</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Account Nickname</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              placeholder="e.g. Primary Operating Account"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Financial Institution</label>
            <input
              type="text"
              required
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Account Type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
            >
              <option value="checking">Checking Account</option>
              <option value="savings">Savings Account</option>
              <option value="credit_card">Corporate Credit Card</option>
            </select>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            Connects via Plaid Sandbox Link. Pre-populates 5 sample transactions and runs the rule-based reconciliation engine automatically.
          </div>

          {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-transform active:scale-95 hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>Connect Sandbox Account</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

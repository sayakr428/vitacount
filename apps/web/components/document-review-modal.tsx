"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, AlertCircle, Eye, X, BookOpen, AlertTriangle } from "lucide-react";
import { verifyAndPostExpenseAction } from "@/lib/actions/documents";

interface DocumentReviewModalProps {
  document: {
    id: string;
    storage_path: string;
    ocr_confidence?: number | null;
    duplicate_detected?: boolean | null;
    extracted_data?: any;
    status: string;
  };
  accounts: Array<{ id: string; code: string; name: string; type: string }>;
  publicStorageUrl?: string;
  onClose: () => void;
}

export function DocumentReviewModal({
  document: doc,
  accounts,
  publicStorageUrl,
  onClose,
}: DocumentReviewModalProps) {
  const extracted = doc.extracted_data || {};
  
  // Expense Category Accounts
  const expenseAccounts = accounts.filter((a) => a.type === "expense");
  const defaultAccount = expenseAccounts[0]?.id || accounts[0]?.id || "";

  const [vendorName, setVendorName] = useState(extracted.vendorName || "Vendor");
  const [expenseDate, setExpenseDate] = useState(extracted.invoiceDate || extracted.date || new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(extracted.totalAmount || 0);
  const [accountId, setAccountId] = useState(extracted.matchedAccountId || defaultAccount);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [memo, setMemo] = useState(`Receipt: ${vendorName}`);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handlePostExpense() {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await verifyAndPostExpenseAction({
        documentId: doc.id,
        vendorName,
        expenseDate,
        amount: Number(amount),
        accountId,
        paymentMethod,
        memo,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to post expense");
      setIsSubmitting(false);
    }
  }

  const confidencePct = doc.ocr_confidence ? Math.round(Number(doc.ocr_confidence) * 100) : 85;
  const isDuplicate = doc.duplicate_detected || extracted.duplicateDetected;
  const isLearnedRule = extracted.learnedFromVendorRule;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-positive/10 text-positive">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">AP Bookkeeping Agent — Receipt Extraction Review</h2>
              <p className="text-xs text-muted-foreground">Autonomy Level L1/L2 • Verified by human before GL posting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Duplicate Warning Banner */}
        {isDuplicate && (
          <div className="flex items-center gap-2 bg-warning/15 px-6 py-2.5 text-xs text-warning border-b border-warning/30">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <strong>Duplicate Receipt Detected:</strong> An existing transaction with identical vendor and exact amount was found within $\pm 3$ days. Review carefully before posting.
            </span>
          </div>
        )}

        {/* Content Body */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2">
          {/* Left Column: Preview / Confidence & Vendor Learning */}
          <div className="border-r border-border bg-muted/20 p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">AI Confidence & Signals</span>
              <div className="flex items-center gap-2">
                {isLearnedRule && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-chart-2/10 px-2.5 py-0.5 text-[10px] font-semibold text-chart-2">
                    <BookOpen className="h-3 w-3" /> Vendor Rule Learned
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-positive/10 px-2.5 py-0.5 text-xs font-semibold text-positive">
                  {confidencePct}% Confidence
                </span>
              </div>
            </div>

            {publicStorageUrl ? (
              <div className="overflow-hidden rounded-xl border border-border bg-black/40 p-2">
                <img
                  src={publicStorageUrl}
                  alt="Receipt Preview"
                  className="max-h-[300px] w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
                <Eye className="mr-2 h-4 w-4" /> Document preview stored securely
              </div>
            )}

            {/* Line Items Table */}
            {extracted.lineItems && extracted.lineItems.length > 0 && (
              <div className="mt-4 rounded-xl border border-border bg-card p-3">
                <div className="mb-2 text-xs font-semibold text-foreground">Extracted Line Items</div>
                <div className="space-y-1.5 text-xs">
                  {extracted.lineItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between border-b border-border/40 pb-1 text-muted-foreground">
                      <div>
                        <div>{item.description}</div>
                        {item.accountCategoryGuess && (
                          <div className="text-[10px] text-muted-foreground/70">Category: {item.accountCategoryGuess}</div>
                        )}
                      </div>
                      <span className="font-mono text-foreground">${Number(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Verification Form */}
          <div className="p-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Vendor / Payee</label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Date</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Total Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground focus:border-primary focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Expense Category Account</label>
                {isLearnedRule && (
                  <span className="text-[10px] text-chart-2">Auto-filled from learned vendor rule</span>
                )}
              </div>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              >
                <option value="cash">Cash / Bank Account</option>
                <option value="credit_card">Company Credit Card</option>
                <option value="reimbursement">Employee Reimbursement</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Memo / Description</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePostExpense}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-positive px-4 py-2 text-xs font-semibold text-white shadow-xs transition-transform active:scale-95 hover:bg-positive disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>Verify & Learn Vendor Rule</span>
          </button>
        </div>
      </div>
    </div>
  );
}

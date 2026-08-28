"use client";

import { useState } from "react";
import { FileText, CheckCircle2, Clock, Sparkles, Eye, ArrowUpRight } from "lucide-react";
import { DocumentReviewModal } from "@/components/document-review-modal";

interface DocumentListClientProps {
  documents: any[];
  accounts: any[];
  agentActions: any[];
}

export function DocumentListClient({
  documents,
  accounts,
  agentActions,
}: DocumentListClientProps) {
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filteredDocs = documents.filter((doc) => {
    if (filterStatus === "all") return true;
    return doc.status === filterStatus;
  });

  const pendingCount = documents.filter((d) => d.status === "pending" || d.status === "extracted").length;
  const postedCount = documents.filter((d) => d.status === "posted").length;

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Documents</div>
          <div className="mt-1 text-xl font-bold text-foreground">{documents.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Draft / Needs Review</div>
          <div className="mt-1 text-xl font-bold text-amber-500">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Posted to GL Ledger</div>
          <div className="mt-1 text-xl font-bold text-emerald-500">{postedCount}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        {["all", "extracted", "pending", "posted"].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              filterStatus === status
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Document Grid / Table */}
      {filteredDocs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/40 p-8 text-center text-xs text-muted-foreground">
          No documents found for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocs.map((doc) => {
            const extracted = doc.extracted_data || {};
            const confidencePct = doc.ocr_confidence
              ? Math.round(Number(doc.ocr_confidence) * 100)
              : null;

            return (
              <div
                key={doc.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40"
              >
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">
                        {extracted.vendorName || "Receipt Document"}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        doc.status === "posted"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : doc.status === "extracted"
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-blue-500/10 text-blue-500"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span className="text-foreground">{extracted.date || doc.created_at?.slice(0, 10)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span className="font-mono font-semibold text-foreground">
                        ${extracted.totalAmount ? Number(extracted.totalAmount).toFixed(2) : "0.00"}
                      </span>
                    </div>
                    {extracted.categorySuggestion && (
                      <div className="flex justify-between">
                        <span>Suggested:</span>
                        <span className="text-foreground">{extracted.categorySuggestion}</span>
                      </div>
                    )}
                  </div>

                  {confidencePct !== null && (
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-500">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{confidencePct}% OCR Confidence</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-border/50 pt-3">
                  {doc.status === "posted" ? (
                    <div className="flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Verified & Posted</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedDoc(doc)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Review & Verify</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {selectedDoc && (
        <DocumentReviewModal
          document={selectedDoc}
          accounts={accounts}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>
  );
}

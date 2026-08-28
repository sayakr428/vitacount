import { createClient } from "@/lib/supabase/server";
import { extractReceiptData } from "@/lib/ocr";

export interface ExtractedLineItem {
  description: string;
  amount: number;
  accountCategoryGuess: string;
  taxRate: number;
}

export interface APBookkeepingResult {
  documentId: string;
  vendorName: string;
  invoiceDate: string;
  totalAmount: number;
  taxAmount: number;
  confidenceScore: number;
  duplicateDetected: boolean;
  learnedFromVendorRule: boolean;
  matchedAccountId: string | null;
  lineItems: ExtractedLineItem[];
  autonomyStatus: "auto_posted" | "needs_review" | "failed";
}

/**
 * AP Bookkeeping Agent: Performs OCR extraction, line-item splitting, duplicate detection,
 * vendor rule lookup, and L2 autonomy policy execution.
 */
export async function runAPBookkeepingAgent(tenantId: string, documentId: string, storagePath: string) {
  const supabase = await createClient();

  // Download storage file buffer
  const { data: fileData } = await supabase.storage.from("receipts").download(storagePath);
  let rawOcr: any = {};

  if (fileData) {
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = fileData.type || "image/png";
    const fileName = storagePath.split("/").pop() || "receipt.png";
    rawOcr = await extractReceiptData(buffer, mimeType, fileName);
  }
  const vendorName = rawOcr.vendorName || "Unknown Vendor";
  const totalAmount = rawOcr.totalAmount || 0;
  const invoiceDate = rawOcr.date || new Date().toISOString().slice(0, 10);
  const taxAmount = rawOcr.taxAmount || 0;
  let confidenceScore = rawOcr.confidenceScore || 0.85;

  // Build itemized line items
  const lineItems: ExtractedLineItem[] = rawOcr.lineItems || [
    {
      description: rawOcr.vendorName ? `${rawOcr.vendorName} Expense` : "Receipt Expense",
      amount: totalAmount,
      accountCategoryGuess: "General Expenses",
      taxRate: taxAmount > 0 ? (taxAmount / Math.max(1, totalAmount - taxAmount)) * 100 : 0,
    },
  ];

  // 2. Vendor Learning Loop: Lookup vendor_rules
  let learnedFromVendorRule = false;
  let matchedAccountId: string | null = null;

  const { data: vendorRule } = await supabase
    .from("vendor_rules")
    .select("default_account_id, default_tax_rate")
    .eq("tenant_id", tenantId)
    .ilike("vendor_name", vendorName)
    .maybeSingle();

  if (vendorRule && vendorRule.default_account_id) {
    matchedAccountId = vendorRule.default_account_id;
    learnedFromVendorRule = true;
    confidenceScore = 1.0; // Boost confidence to 1.0 on learned vendor match
  }

  // If no vendor rule, lookup default General Expense account (6000)
  if (!matchedAccountId) {
    const { data: defaultAcc } = await supabase
      .from("accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", "6000")
      .maybeSingle();
    matchedAccountId = defaultAcc?.id || null;
  }

  // 3. Duplicate Detection Engine: Check for exact amount + date window +-3 days
  let duplicateDetected = false;
  const docDate = new Date(invoiceDate);
  const startDate = new Date(docDate);
  startDate.setDate(startDate.getDate() - 3);
  const endDate = new Date(docDate);
  endDate.setDate(endDate.getDate() + 3);

  // Check existing expenses
  const { data: existingExpenses } = await supabase
    .from("expenses")
    .select("id, amount, expense_date")
    .eq("tenant_id", tenantId)
    .gte("expense_date", startDate.toISOString().slice(0, 10))
    .lte("expense_date", endDate.toISOString().slice(0, 10));

  if (existingExpenses) {
    for (const exp of existingExpenses) {
      if (Math.abs(Number(exp.amount) - totalAmount) < 0.01) {
        duplicateDetected = true;
        break;
      }
    }
  }

  // Check existing bills
  if (!duplicateDetected) {
    const { data: existingBills } = await supabase
      .from("bills")
      .select("id, total, issue_date")
      .eq("tenant_id", tenantId)
      .gte("issue_date", startDate.toISOString().slice(0, 10))
      .lte("issue_date", endDate.toISOString().slice(0, 10));

    if (existingBills) {
      for (const bill of existingBills) {
        if (Math.abs(Number(bill.total) - totalAmount) < 0.01) {
          duplicateDetected = true;
          break;
        }
      }
    }
  }

  // 4. Determine Autonomy Policy Outcome
  let autonomyStatus: "auto_posted" | "needs_review" | "failed" = "needs_review";

  if (confidenceScore >= 0.90 && !duplicateDetected && matchedAccountId) {
    autonomyStatus = "auto_posted";
  } else if (confidenceScore < 0.70) {
    autonomyStatus = "failed";
  }

  // 5. Update document record
  await supabase
    .from("documents")
    .update({
      doc_type: "receipt",
      status: autonomyStatus === "auto_posted" ? "verified" : "needs_review",
      ocr_confidence: confidenceScore,
      duplicate_detected: duplicateDetected,
      line_items: lineItems as any,
      extracted_data: {
        vendorName,
        totalAmount,
        invoiceDate,
        taxAmount,
        confidenceScore,
        duplicateDetected,
        learnedFromVendorRule,
        lineItems,
      } as any,
    })
    .eq("id", documentId);

  // 6. Execute L2 Autonomy Posting if auto_posted
  if (autonomyStatus === "auto_posted" && matchedAccountId) {
    const { data: postedExpense } = await supabase
      .from("expenses")
      .insert({
        tenant_id: tenantId,
        amount: totalAmount,
        expense_date: invoiceDate,
        account_id: matchedAccountId,
        receipt_document_id: documentId,
        status: "posted",
        payment_method: "card",
        memo: `${vendorName} (Auto-posted by AP Agent)`,
      })
      .select("id")
      .single();

    if (postedExpense) {
      // Trigger GL posting engine RPC
      await supabase.rpc("post_expense_created", {
        p_tenant_id: tenantId,
        p_expense_date: invoiceDate,
        p_account_id: matchedAccountId,
        p_amount: totalAmount,
        p_contact_id: null,
        p_payment_method: "card",
        p_document_id: documentId,
        p_memo: `${vendorName} (Auto-posted by AP Agent)`,
      });

      // Update document link
      await supabase
        .from("documents")
        .update({ linked_expense_id: postedExpense.id })
        .eq("id", documentId);

      // Log agent action
      await supabase.from("agent_actions").insert({
        tenant_id: tenantId,
        agent_name: "ap_bookkeeping_agent",
        module: "ap",
        trigger_event: "document_upload_ocr",
        input_context: { document_id: documentId, vendor_name: vendorName },
        proposed_action: {
          expense_id: postedExpense.id,
          amount: totalAmount,
          account_id: matchedAccountId,
        },
        confidence_score: confidenceScore,
        autonomy_level: 2,
        status: "auto_executed",
      });
    }
  }

  return {
    documentId,
    vendorName,
    invoiceDate,
    totalAmount,
    taxAmount,
    confidenceScore,
    duplicateDetected,
    learnedFromVendorRule,
    matchedAccountId,
    lineItems,
    autonomyStatus,
  };
}

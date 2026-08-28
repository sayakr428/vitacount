"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { extractReceiptData } from "@/lib/ocr";

export async function uploadDocumentAction(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file provided");
  }

  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    throw new Error("No active workspace selected");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error("Unauthorized");
  }

  const fileExt = file.name.split(".").pop() || "png";
  const storagePath = `${activeTenantId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

  // 1. Upload file to Supabase Storage
  let { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(storagePath, file, { contentType: file.type });

  // Fallback: If bucket is missing, attempt auto-creation via admin client
  if (uploadError && (uploadError.message?.toLowerCase().includes("bucket") || uploadError.message?.toLowerCase().includes("not found"))) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const adminSupabase = createAdminClient();
      await adminSupabase.storage.createBucket("receipts", { public: true });
      const retry = await adminSupabase.storage
        .from("receipts")
        .upload(storagePath, file, { contentType: file.type });
      uploadError = retry.error;
    } catch (e) {
      console.warn("Auto bucket creation fallback skipped or failed:", e);
    }
  }

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    throw new Error(`Failed to upload file: ${uploadError.message}`);
  }

  // 2. Insert Document record with status='pending'
  const { data: docRecord, error: docError } = await supabase
    .from("documents")
    .insert({
      tenant_id: activeTenantId,
      uploaded_by: userData.user.id,
      storage_path: storagePath,
      doc_type: "receipt",
      status: "pending",
    })
    .select()
    .single();

  if (docError || !docRecord) {
    throw new Error(`Failed to save document record: ${docError?.message}`);
  }

  // 3. Process AP Bookkeeping Agent (OCR, Line Items, Vendor Learning, Duplicate Check)
  try {
    const { runAPBookkeepingAgent } = await import("@/lib/ap-bookkeeping-agent");
    await runAPBookkeepingAgent(activeTenantId, docRecord.id, storagePath);
  } catch (ocrErr) {
    console.error("AP Agent process error:", ocrErr);
    await supabase
      .from("documents")
      .update({ status: "pending" })
      .eq("id", docRecord.id);
  }

  revalidatePath("/documents");
  return { success: true, documentId: docRecord.id };
}

export async function verifyAndPostExpenseAction(payload: {
  documentId: string;
  vendorName: string;
  expenseDate: string;
  amount: number;
  accountId: string;
  paymentMethod?: string;
  memo?: string;
}) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) {
    throw new Error("No active workspace");
  }

  const supabase = await createClient();

  // 1. Learn Vendor Rule for future receipts
  if (payload.vendorName && payload.accountId) {
    const { saveVendorRuleAction } = await import("@/lib/actions/vendor-rules-actions");
    await saveVendorRuleAction(activeTenantId, payload.vendorName, payload.accountId);
  }

  // Find or create Contact for the vendor
  let contactId: string | null = null;
  if (payload.vendorName) {
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("tenant_id", activeTenantId)
      .ilike("display_name", payload.vendorName.trim())
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          tenant_id: activeTenantId,
          display_name: payload.vendorName.trim(),
          type: "vendor",
        })
        .select("id")
        .single();
      contactId = newContact?.id || null;
    }
  }

  // Call security-definer RPC function post_expense_created
  const { data: expenseId, error: rpcError } = await supabase.rpc("post_expense_created", {
    p_tenant_id: activeTenantId,
    p_contact_id: contactId,
    p_expense_date: payload.expenseDate,
    p_amount: payload.amount,
    p_account_id: payload.accountId,
    p_payment_method: payload.paymentMethod || "cash",
    p_memo: payload.memo || `Receipt expense: ${payload.vendorName}`,
    p_document_id: payload.documentId,
  });

  if (rpcError) {
    throw new Error(`Failed to post expense: ${rpcError.message}`);
  }

  // Approve linked agent action
  const { data: userData } = await supabase.auth.getUser();
  await supabase
    .from("agent_actions")
    .update({
      status: "approved",
      executed_at: new Date().toISOString(),
      reviewed_by: userData.user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("tenant_id", activeTenantId)
    .eq("module", "documents")
    .filter("input_context->>document_id", "eq", payload.documentId);

  revalidatePath("/documents");
  revalidatePath("/expenses");
  return { success: true, expenseId };
}

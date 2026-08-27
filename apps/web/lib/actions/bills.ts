"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateBillState = { error: string | null };

type BillLineInput = {
  accountId: string;
  description: string;
  quantity: number;
  unitCost: number;
};

/**
 * Bills post immediately (no draft state in their schema) — create_bill_received
 * creates the bill, its lines, and the GL entry atomically in one RPC call.
 */
export async function createBillAction(
  tenantId: string,
  _prevState: CreateBillState,
  formData: FormData,
): Promise<CreateBillState> {
  const vendorId = String(formData.get("vendorId") ?? "");
  const billNumber = String(formData.get("billNumber") ?? "").trim();
  const issueDate = String(formData.get("issueDate") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const linesJson = String(formData.get("lines") ?? "[]");

  if (!vendorId) {
    return { error: "Select a vendor." };
  }

  let rawLines: BillLineInput[];
  try {
    rawLines = JSON.parse(linesJson);
  } catch {
    return { error: "Malformed line data." };
  }

  const lines = rawLines.filter((l) => l.accountId && l.quantity > 0 && l.unitCost >= 0);
  if (lines.length === 0) {
    return { error: "Add at least one line item with an expense category." };
  }

  const supabase = await createClient();
  const { data: billId, error } = await supabase.rpc("create_bill_received", {
    p_tenant_id: tenantId,
    p_vendor_id: vendorId,
    p_bill_number: (billNumber || null) as string,
    p_issue_date: issueDate,
    p_due_date: dueDate,
    p_lines: lines.map((l) => ({
      accountId: l.accountId,
      description: l.description || null,
      quantity: l.quantity,
      unitCost: l.unitCost,
      amount: round2(l.quantity * l.unitCost),
    })),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect(`/expenses/${billId}`);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

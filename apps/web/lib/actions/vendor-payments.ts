"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RecordVendorPaymentState = { error: string | null };

export async function recordVendorPaymentAction(
  tenantId: string,
  vendorId: string,
  billId: string,
  _prevState: RecordVendorPaymentState,
  formData: FormData,
): Promise<RecordVendorPaymentState> {
  const paymentDate = String(formData.get("paymentDate") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const method = String(formData.get("method") ?? "").trim();
  const scheduledFor = String(formData.get("scheduledFor") ?? "").trim();

  if (!(amount > 0)) {
    return { error: "Enter a payment amount greater than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_vendor_payment_made", {
    p_tenant_id: tenantId,
    p_vendor_id: vendorId,
    p_payment_date: paymentDate,
    p_amount: amount,
    p_method: (method || null) as string,
    p_scheduled_for: (scheduledFor || null) as string,
    p_applications: [{ billId, amount }],
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${billId}`);
  revalidatePath("/dashboard");
  redirect(`/expenses/${billId}`);
}

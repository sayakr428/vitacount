"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateContactState = { error: string | null };

const CONTACT_TYPES = ["customer", "vendor", "both"] as const;

export async function createContactAction(
  tenantId: string,
  _prevState: CreateContactState,
  formData: FormData,
): Promise<CreateContactState> {
  const type = String(formData.get("type") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const paymentTerms = String(formData.get("paymentTerms") ?? "net_30");
  const is1099Vendor = formData.get("is1099Vendor") === "on";

  if (!displayName) {
    return { error: "Name is required." };
  }
  if (!CONTACT_TYPES.includes(type as (typeof CONTACT_TYPES)[number])) {
    return { error: "Invalid contact type." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contacts").insert({
    tenant_id: tenantId,
    type,
    display_name: displayName,
    email: email || null,
    phone: phone || null,
    payment_terms: paymentTerms,
    is_1099_vendor: is1099Vendor,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/contacts");
  redirect("/contacts");
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CreateAccountState = { error: string | null };

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

export async function createAccountAction(
  tenantId: string,
  _prevState: CreateAccountState,
  formData: FormData,
): Promise<CreateAccountState> {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");

  if (!code || !name) {
    return { error: "Code and name are required." };
  }
  if (!ACCOUNT_TYPES.includes(type as (typeof ACCOUNT_TYPES)[number])) {
    return { error: "Invalid account type." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert({
    tenant_id: tenantId,
    code,
    name,
    type,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/cpa/accounts");
  return { error: null };
}

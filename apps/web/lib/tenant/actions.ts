"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenant/data";

export async function switchTenantAction(tenantId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export type CreateTenantState = { error: string | null };

export async function createTenantAction(
  _prevState: CreateTenantState,
  formData: FormData,
): Promise<CreateTenantState> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Workspace name is required." };
  }

  const supabase = await createClient();
  const { data: tenantId, error } = await supabase.rpc("create_tenant", {
    tenant_name: name,
  });

  if (error) {
    return { error: error.message };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId as string, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}

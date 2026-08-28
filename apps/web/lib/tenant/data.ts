import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_TENANT_COOKIE = "vitacount_tenant_id";

export type TenantSummary = {
  id: string;
  name: string;
  plan_tier: string;
};

export type MembershipSummary = {
  tenant_id: string;
  role: string;
  tenant: TenantSummary | null;
};

export async function getUserMemberships(): Promise<MembershipSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("tenant_id, role, tenant:tenants(id, name, plan_tier)")
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getActiveTenantId(
  memberships: MembershipSummary[],
): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;

  if (cookieValue && memberships.some((m) => m.tenant_id === cookieValue)) {
    return cookieValue;
  }

  return memberships[0]?.tenant_id ?? null;
}

export async function loadTenantContext() {
  const memberships = await getUserMemberships();
  const activeTenantId = await getActiveTenantId(memberships);
  const active = memberships.find((m) => m.tenant_id === activeTenantId) ?? null;

  return {
    memberships,
    activeTenantId,
    activeTenant: active?.tenant ?? null,
    role: active?.role ?? null,
  };
}

"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveVendorRuleAction(
  tenantId: string,
  vendorName: string,
  defaultAccountId: string,
  defaultTaxRate: number = 0.00
) {
  const supabase = await createClient();

  // Upsert vendor rule for tenant and vendor name
  const { data, error } = await supabase
    .from("vendor_rules")
    .upsert(
      {
        tenant_id: tenantId,
        vendor_name: vendorName.trim(),
        default_account_id: defaultAccountId,
        default_tax_rate: defaultTaxRate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id, vendor_name" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getVendorRulesAction(tenantId: string) {
  const supabase = await createClient();

  const { data: rules } = await supabase
    .from("vendor_rules")
    .select("*, account:accounts(name, code)")
    .eq("tenant_id", tenantId)
    .order("vendor_name", { ascending: true });

  return rules || [];
}

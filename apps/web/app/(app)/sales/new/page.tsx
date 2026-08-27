import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewInvoiceForm } from "@/components/new-invoice-form";

export default async function NewInvoicePage() {
  const { activeTenantId, activeTenant } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const [{ data: contacts }, { data: tenant }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, display_name")
      .eq("tenant_id", activeTenantId)
      .in("type", ["customer", "both"])
      .order("display_name"),
    supabase.from("tenants").select("default_tax_rate").eq("id", activeTenantId).single(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">New Invoice</h1>
      <p className="mt-1 text-sm text-muted-foreground">Workspace: {activeTenant?.name}</p>

      {contacts?.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Invoice details</CardTitle>
          </CardHeader>
          <CardContent>
            <NewInvoiceForm
              tenantId={activeTenantId}
              contacts={contacts}
              defaultTaxRate={tenant?.default_tax_rate ?? 0}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You need at least one customer contact before creating an invoice.{" "}
              <a href="/contacts" className="text-primary hover:underline">
                Add a contact →
              </a>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

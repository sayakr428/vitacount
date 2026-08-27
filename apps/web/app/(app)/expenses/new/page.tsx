import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewBillForm } from "@/components/new-bill-form";

export default async function NewBillPage() {
  const { activeTenantId, activeTenant } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const [{ data: vendors }, { data: expenseAccounts }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, display_name")
      .eq("tenant_id", activeTenantId)
      .in("type", ["vendor", "both"])
      .order("display_name"),
    supabase
      .from("accounts")
      .select("id, code, name")
      .eq("tenant_id", activeTenantId)
      .eq("type", "expense")
      .order("code"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">New Bill</h1>
      <p className="mt-1 text-sm text-muted-foreground">Workspace: {activeTenant?.name}</p>

      {vendors?.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Bill details</CardTitle>
          </CardHeader>
          <CardContent>
            <NewBillForm tenantId={activeTenantId} vendors={vendors} expenseAccounts={expenseAccounts ?? []} />
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You need at least one vendor contact before recording a bill.{" "}
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

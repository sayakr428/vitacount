import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesDocumentForm } from "@/components/sales-document-form";
import { RefundCreditForm, RefundModeSwitch, type CustomerCredit } from "@/components/refund-credit-form";
import { SALES_DOCUMENTS, addressLines, isSalesDocumentType, type SalesDocumentType } from "@/lib/documents";
import { fractionToPercentText } from "@/lib/money";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function NewSalesDocumentPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeTenantId, activeTenant } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const params = await searchParams;
  const typeParam = first(params.type);
  const documentType: SalesDocumentType = isSalesDocumentType(typeParam) ? typeParam : "invoice";
  const config = SALES_DOCUMENTS[documentType];
  const customerParam = first(params.customer);

  const supabase = await createClient();
  const [{ data: contacts }, { data: tenant }, { data: credits }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, display_name, email, billing_address")
      .eq("tenant_id", activeTenantId)
      .in("type", ["customer", "both"])
      .order("display_name"),
    supabase.from("tenants").select("name, default_tax_rate").eq("id", activeTenantId).single(),
    documentType === "refund_receipt"
      ? supabase.from("payments_received").select("contact_id, unapplied_amount").eq("tenant_id", activeTenantId).gt("unapplied_amount", 0)
      : Promise.resolve({ data: [] as { contact_id: string; unapplied_amount: number }[] }),
  ]);

  const customers = (contacts ?? []).map((c) => ({
    id: c.id,
    display_name: c.display_name,
    email: c.email,
    addressLines: addressLines(c.billing_address),
  }));

  const creditByCustomer = new Map<string, number>();
  for (const row of credits ?? []) {
    creditByCustomer.set(row.contact_id, (creditByCustomer.get(row.contact_id) ?? 0) + Number(row.unapplied_amount));
  }
  const customersWithCredit: CustomerCredit[] = customers
    .filter((c) => (creditByCustomer.get(c.id) ?? 0) > 0)
    .map((c) => ({ id: c.id, name: c.display_name, credit: Math.round(creditByCustomer.get(c.id)! * 100) / 100 }));

  const form = (
    <SalesDocumentForm
      key={documentType}
      tenantId={activeTenantId}
      documentType={documentType}
      customers={customers}
      defaultTaxRate={fractionToPercentText(tenant?.default_tax_rate ?? 0)}
      businessName={tenant?.name ?? activeTenant?.name ?? "Your business"}
      defaultCustomerId={customers.some((c) => c.id === customerParam) ? customerParam : undefined}
    />
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">New {config.label.toLowerCase()}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>

      {customers.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{config.label} details</CardTitle>
          </CardHeader>
          <CardContent>
            {documentType === "refund_receipt" && customersWithCredit.length > 0 ? (
              <RefundModeSwitch
                defaultMode={first(params.source) === "credit" ? "credit" : "sale"}
                saleForm={form}
                creditForm={
                  <RefundCreditForm tenantId={activeTenantId} customers={customersWithCredit} defaultCustomerId={customerParam} />
                }
              />
            ) : (
              form
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You need at least one customer before creating a {config.label.toLowerCase()}.{" "}
              <Link href="/contacts" className="text-primary hover:underline">
                Add a contact →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

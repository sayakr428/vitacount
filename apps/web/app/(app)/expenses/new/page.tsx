import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseDocumentForm } from "@/components/purchase-document-form";
import { NewExpenseForm } from "@/components/new-expense-form";
import { PURCHASE_DOCUMENTS, isPurchaseDocumentType } from "@/lib/documents";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const EXPENSE_COPY = {
  label: "Expense",
  description: "Something you've already paid for — a card swipe, cash, a transfer. It goes straight into your books as paid.",
};

export default async function NewPurchasePage({ searchParams }: { searchParams: SearchParams }) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const params = await searchParams;
  const typeParam = first(params.type);
  const kind = typeParam === "expense" ? "expense" : isPurchaseDocumentType(typeParam) ? typeParam : "bill";
  const copy = kind === "expense" ? EXPENSE_COPY : PURCHASE_DOCUMENTS[kind];
  const vendorParam = first(params.vendor);

  const supabase = await createClient();
  const [{ data: vendors }, { data: expenseAccounts }] = await Promise.all([
    supabase.from("contacts").select("id, display_name").eq("tenant_id", activeTenantId).in("type", ["vendor", "both"]).order("display_name"),
    supabase.from("accounts").select("id, code, name").eq("tenant_id", activeTenantId).eq("type", "expense").order("code"),
  ]);

  const needsVendor = kind !== "expense";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">New {copy.label.toLowerCase()}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>

      {!needsVendor || vendors?.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{copy.label} details</CardTitle>
          </CardHeader>
          <CardContent>
            {kind === "expense" ? (
              <NewExpenseForm tenantId={activeTenantId} vendors={vendors ?? []} expenseAccounts={expenseAccounts ?? []} />
            ) : (
              <PurchaseDocumentForm
                key={kind}
                tenantId={activeTenantId}
                documentType={kind}
                vendors={vendors ?? []}
                expenseAccounts={expenseAccounts ?? []}
                defaultVendorId={vendors?.some((v) => v.id === vendorParam) ? vendorParam : undefined}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You need at least one supplier before recording a {copy.label.toLowerCase()}.{" "}
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

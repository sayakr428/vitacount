import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayBillsForm, type OpenBill, type PayableVendor } from "@/components/pay-bills-form";
import { formatMoney } from "@/lib/money";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function PayBillsPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const params = await searchParams;
  const vendorParam = first(params.vendor);
  const billParam = first(params.bill);
  const paidParam = first(params.paid);

  const supabase = await createClient();
  const [{ data: contacts }, { data: bills }, { data: credits }, paid] = await Promise.all([
    supabase.from("contacts").select("id, display_name").eq("tenant_id", activeTenantId).in("type", ["vendor", "both"]).order("display_name"),
    supabase
      .from("bills")
      .select("id, bill_number, vendor_id, issue_date, due_date, total, balance_due")
      .eq("tenant_id", activeTenantId)
      .eq("document_type", "bill")
      .in("status", ["open", "partial"])
      .gt("balance_due", 0),
    supabase
      .from("bills")
      .select("vendor_id, balance_due")
      .eq("tenant_id", activeTenantId)
      .eq("document_type", "vendor_credit")
      .gt("balance_due", 0),
    paidParam
      ? supabase
          .from("payments_made")
          .select("id, amount, vendor:contacts(display_name)")
          .eq("id", paidParam)
          .eq("tenant_id", activeTenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const openBills: OpenBill[] = (bills ?? []).map((b) => ({
    id: b.id,
    number: b.bill_number,
    vendorId: b.vendor_id,
    issueDate: b.issue_date,
    dueDate: b.due_date,
    total: Number(b.total),
    balanceDue: Number(b.balance_due),
  }));

  const owed = new Map<string, number>();
  for (const b of openBills) owed.set(b.vendorId, (owed.get(b.vendorId) ?? 0) + b.balanceDue);
  const credit = new Map<string, number>();
  for (const c of credits ?? []) credit.set(c.vendor_id, (credit.get(c.vendor_id) ?? 0) + Number(c.balance_due));

  const vendors: PayableVendor[] = (contacts ?? []).map((v) => ({
    id: v.id,
    name: v.display_name,
    openBalance: Math.round((owed.get(v.id) ?? 0) * 100) / 100,
    credit: Math.round((credit.get(v.id) ?? 0) * 100) / 100,
  }));

  const paidPayment = paid.data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Pay bills</h1>
          <p className="mt-1 text-sm text-muted-foreground">One payment — a check or a transfer — across a supplier&apos;s open bills.</p>
        </div>
        <Link href="/expenses" className="text-sm font-medium text-primary hover:underline">
          ← Back to expenses
        </Link>
      </div>

      {paidPayment && (
        <div className="rounded-xl bg-positive/10 px-4 py-3 text-sm text-foreground" role="status">
          <span className="font-semibold">Payment recorded.</span> {formatMoney(paidPayment.amount)} to{" "}
          {paidPayment.vendor?.display_name ?? "the supplier"}.
        </div>
      )}

      {vendors.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Payment details</CardTitle>
          </CardHeader>
          <CardContent>
            <PayBillsForm
              key={paidParam ?? "new"}
              tenantId={activeTenantId}
              vendors={vendors}
              openBills={openBills}
              defaultVendorId={vendors.some((v) => v.id === vendorParam) ? vendorParam : undefined}
              focusBillId={billParam}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Add a supplier first.{" "}
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

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordVendorPaymentForm } from "@/components/record-vendor-payment-form";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-chart-2/15 text-chart-2",
  scheduled: "bg-warning/15 text-warning",
  partial: "bg-warning/15 text-warning",
  paid: "bg-positive/15 text-positive",
  void: "bg-muted text-muted-foreground",
};

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const { data: bill } = await supabase
    .from("bills")
    .select("id, bill_number, issue_date, due_date, status, total, balance_due, vendor:contacts(id, display_name)")
    .eq("id", id)
    .eq("tenant_id", activeTenantId)
    .single();

  if (!bill) notFound();

  const { data: lines } = await supabase
    .from("bill_lines")
    .select("id, description, quantity, unit_cost, amount, account:accounts(code, name)")
    .eq("bill_id", id)
    .order("sort_order");

  const { data: payments } = await supabase
    .from("bill_payment_applications")
    .select("amount_applied, payment:payments_made(payment_date, method)")
    .eq("bill_id", id);

  const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{bill.bill_number ?? "Bill"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{bill.vendor?.display_name}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLE[bill.status] ?? ""}`}>
          {bill.status}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines?.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-2 pr-4 text-muted-foreground">
                    {l.account ? `${l.account.code} — ${l.account.name}` : "—"}
                  </td>
                  <td className="py-2 pr-4">{l.description}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{currency(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex flex-col items-end gap-1 text-sm">
            <span className="font-heading text-base font-semibold">Total {currency(bill.total)}</span>
            {bill.balance_due > 0 && <span className="text-destructive">Balance due {currency(bill.balance_due)}</span>}
          </div>
        </CardContent>
      </Card>

      {bill.balance_due > 0 && bill.vendor && (
        <Card>
          <CardHeader>
            <CardTitle>Record a payment</CardTitle>
          </CardHeader>
          <CardContent>
            <RecordVendorPaymentForm
              tenantId={activeTenantId}
              vendorId={bill.vendor.id}
              billId={bill.id}
              balanceDue={bill.balance_due}
            />
          </CardContent>
        </Card>
      )}

      {payments && payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60 text-sm">
              {payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">
                    {p.payment?.payment_date} · {p.payment?.method}
                  </span>
                  <span className="tabular-nums">{currency(p.amount_applied)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

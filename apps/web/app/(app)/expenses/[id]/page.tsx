import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordVendorPaymentForm } from "@/components/record-vendor-payment-form";
import { formatDate } from "@/lib/dates";
import {
  PURCHASE_DOCUMENTS,
  PURCHASE_STATUS_STYLE,
  isPurchaseDocumentType,
  paymentMethodLabel,
  purchaseStatusLabel,
  termsLabel,
} from "@/lib/documents";
import { formatMoney } from "@/lib/money";

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
    .select("id, bill_number, document_type, issue_date, due_date, status, total, balance_due, vendor:contacts(id, display_name)")
    .eq("id", id)
    .eq("tenant_id", activeTenantId)
    .single();

  if (!bill) notFound();

  const documentType = isPurchaseDocumentType(bill.document_type) ? bill.document_type : "bill";
  const isCredit = documentType === "vendor_credit";
  const config = PURCHASE_DOCUMENTS[documentType];

  const [{ data: lines }, { data: payments }, { data: creditApplications }] = await Promise.all([
    supabase.from("bill_lines").select("id, description, quantity, unit_cost, amount, account:accounts(code, name)").eq("bill_id", id).order("sort_order"),
    supabase.from("bill_payment_applications").select("amount_applied, payment:payments_made(payment_date, method, reference)").eq("bill_id", id),
    supabase
      .from("vendor_credit_applications")
      .select("id, amount_applied, applied_on, bill:bills!vendor_credit_applications_bill_id_fkey(id, bill_number), credit:bills!vendor_credit_applications_vendor_credit_id_fkey(id, bill_number)")
      .eq(isCredit ? "vendor_credit_id" : "bill_id", id)
      .order("created_at"),
  ]);

  const terms = termsLabel(bill.issue_date, bill.due_date);
  const isOpenBill = !isCredit && bill.balance_due > 0 && bill.status !== "void";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{config.label}</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{bill.bill_number ?? config.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{bill.vendor?.display_name}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${PURCHASE_STATUS_STYLE[bill.status] ?? ""}`}>
          {purchaseStatusLabel(documentType, bill.status)}
        </span>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{isCredit ? "Credit date" : "Bill date"}</dt>
              <dd className="mt-0.5 font-medium">{formatDate(bill.issue_date)}</dd>
            </div>
            {isCredit ? (
              <div>
                <dt className="text-xs text-muted-foreground">Credit left to use</dt>
                <dd className="mt-0.5 font-medium">{formatMoney(bill.balance_due)}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt className="text-xs text-muted-foreground">Due date</dt>
                  <dd className="mt-0.5 font-medium">{bill.due_date ? formatDate(bill.due_date) : "No due date"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Terms</dt>
                  <dd className="mt-0.5 font-medium">{terms ?? "—"}</dd>
                </div>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                    <td className="py-2 pr-4 text-muted-foreground">{l.account ? `${l.account.code} — ${l.account.name}` : "—"}</td>
                    <td className="py-2 pr-4">{l.description}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{l.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col items-end gap-1 text-sm">
            <span className="font-heading text-base font-semibold">
              {isCredit ? "Credit total" : "Total"} {formatMoney(bill.total)}
            </span>
            {isOpenBill && <span className="text-destructive">Balance due {formatMoney(bill.balance_due)}</span>}
          </div>
        </CardContent>
      </Card>

      {isCredit && bill.balance_due > 0 && bill.vendor && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {formatMoney(bill.balance_due)} of this credit is still unused. Apply it to {bill.vendor.display_name}&apos;s open bills
              when you pay them.
            </p>
            <Link
              href={`/expenses/pay-bills?vendor=${bill.vendor.id}`}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
            >
              Go to Pay bills
            </Link>
          </CardContent>
        </Card>
      )}

      {isOpenBill && bill.vendor && (
        <Card>
          <CardHeader>
            <CardTitle>Record a payment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RecordVendorPaymentForm tenantId={activeTenantId} vendorId={bill.vendor.id} billId={bill.id} balanceDue={bill.balance_due} />
            <p className="text-xs text-muted-foreground">
              Paying several bills with one check or transfer?{" "}
              <Link href={`/expenses/pay-bills?vendor=${bill.vendor.id}&bill=${bill.id}`} className="font-medium text-primary hover:underline">
                Pay bills together →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {((payments && payments.length > 0) || (creditApplications && creditApplications.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle>{isCredit ? "Where this credit was used" : "Payment history"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60 text-sm">
              {!isCredit &&
                payments?.map((p, i) => (
                  <li key={`p${i}`} className="flex items-center justify-between gap-4 py-2">
                    <span className="text-muted-foreground">
                      {formatDate(p.payment?.payment_date)} · {paymentMethodLabel(p.payment?.method)}
                      {p.payment?.reference ? ` · ${p.payment.reference}` : ""}
                    </span>
                    <span className="tabular-nums">{formatMoney(p.amount_applied)}</span>
                  </li>
                ))}
              {creditApplications?.map((a) => {
                const other = isCredit ? a.bill : a.credit;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-2">
                    <span className="text-muted-foreground">
                      {formatDate(a.applied_on)} · {isCredit ? "Applied to bill " : "Supplier credit "}
                      {other ? (
                        <Link href={`/expenses/${other.id}`} className="font-medium text-primary hover:underline">
                          {other.bill_number ?? (isCredit ? "bill" : "credit")}
                        </Link>
                      ) : null}
                    </span>
                    <span className="tabular-nums">{formatMoney(a.amount_applied)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

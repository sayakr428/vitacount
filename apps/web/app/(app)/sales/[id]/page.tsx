import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueInvoiceButton } from "@/components/issue-invoice-button";
import { RecordInvoicePaymentForm } from "@/components/record-invoice-payment-form";
import { CreateStripeLinkButton } from "@/components/create-stripe-link-button";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-secondary text-secondary-foreground",
  sent: "bg-chart-2/15 text-chart-2",
  partial: "bg-warning/15 text-warning",
  paid: "bg-positive/15 text-positive",
  overdue: "bg-destructive/15 text-destructive",
  void: "bg-muted text-muted-foreground",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, issue_date, due_date, status, subtotal, tax_total, total, balance_due, contact:contacts(id, display_name, email)",
    )
    .eq("id", id)
    .eq("tenant_id", activeTenantId)
    .single();

  if (!invoice) notFound();

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("id, description, quantity, unit_price, tax_rate, amount")
    .eq("invoice_id", id)
    .order("sort_order");

  const { data: payments } = await supabase
    .from("payment_applications")
    .select("amount_applied, payment:payments_received(payment_date, method, reference)")
    .eq("invoice_id", id);

  const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{invoice.invoice_number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{invoice.contact?.display_name}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLE[invoice.status] ?? ""}`}>
          {invoice.status}
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
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 text-right font-medium">Qty</th>
                <th className="py-2 pr-4 text-right font-medium">Unit price</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines?.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-2 pr-4">{l.description}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{currency(l.unit_price)}</td>
                  <td className="py-2 text-right tabular-nums">{currency(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex flex-col items-end gap-1 text-sm">
            <span className="text-muted-foreground">Subtotal {currency(invoice.subtotal)}</span>
            <span className="text-muted-foreground">Tax {currency(invoice.tax_total)}</span>
            <span className="font-heading text-base font-semibold">Total {currency(invoice.total)}</span>
            {invoice.balance_due > 0 && invoice.status !== "draft" && (
              <span className="text-destructive">Balance due {currency(invoice.balance_due)}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {invoice.status === "draft" && (
        <Card>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              This invoice hasn&apos;t been sent yet — no GL entry has been posted.
            </p>
            <IssueInvoiceButton invoiceId={invoice.id} />
          </CardContent>
        </Card>
      )}

      {invoice.status !== "draft" && invoice.status !== "void" && (
        <Card>
          <CardHeader>
            <CardTitle>Get paid online</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateStripeLinkButton invoiceId={invoice.id} />
          </CardContent>
        </Card>
      )}

      {invoice.status !== "draft" && invoice.balance_due > 0 && invoice.contact && (
        <Card>
          <CardHeader>
            <CardTitle>Record a manual payment</CardTitle>
          </CardHeader>
          <CardContent>
            <RecordInvoicePaymentForm
              tenantId={activeTenantId}
              contactId={invoice.contact.id}
              invoiceId={invoice.id}
              balanceDue={invoice.balance_due}
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
                    {p.payment?.reference ? ` · ${p.payment.reference}` : ""}
                  </span>
                  <span className="tabular-nums text-positive">{currency(p.amount_applied)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

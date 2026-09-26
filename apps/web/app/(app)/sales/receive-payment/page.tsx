import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceivePaymentForm, type OpenReceivable, type PayingCustomer } from "@/components/receive-payment-form";
import { formatMoney } from "@/lib/money";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ReceivePaymentPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const params = await searchParams;
  const customerParam = first(params.customer);
  const invoiceParam = first(params.invoice);
  const recordedParam = first(params.recorded);

  const supabase = await createClient();
  const [{ data: contacts }, { data: openDocs }, { data: credits }, recorded] = await Promise.all([
    supabase.from("contacts").select("id, display_name").eq("tenant_id", activeTenantId).in("type", ["customer", "both"]).order("display_name"),
    supabase
      .from("invoices")
      .select("id, invoice_number, document_type, contact_id, issue_date, due_date, total, balance_due")
      .eq("tenant_id", activeTenantId)
      .in("document_type", ["invoice", "debit_note"])
      .in("status", ["sent", "partial", "overdue"])
      .gt("balance_due", 0),
    supabase.from("payments_received").select("contact_id, unapplied_amount").eq("tenant_id", activeTenantId).gt("unapplied_amount", 0),
    recordedParam
      ? supabase
          .from("payments_received")
          .select("id, amount, unapplied_amount, contact:contacts(display_name)")
          .eq("id", recordedParam)
          .eq("tenant_id", activeTenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const openInvoices: OpenReceivable[] = (openDocs ?? []).map((d) => ({
    id: d.id,
    number: d.invoice_number,
    documentType: d.document_type,
    contactId: d.contact_id,
    issueDate: d.issue_date,
    dueDate: d.due_date,
    total: Number(d.total),
    balanceDue: Number(d.balance_due),
  }));

  const openByCustomer = new Map<string, number>();
  for (const inv of openInvoices) openByCustomer.set(inv.contactId, (openByCustomer.get(inv.contactId) ?? 0) + inv.balanceDue);
  const creditByCustomer = new Map<string, number>();
  for (const c of credits ?? []) creditByCustomer.set(c.contact_id, (creditByCustomer.get(c.contact_id) ?? 0) + Number(c.unapplied_amount));

  const customers: PayingCustomer[] = (contacts ?? []).map((c) => ({
    id: c.id,
    name: c.display_name,
    openBalance: Math.round((openByCustomer.get(c.id) ?? 0) * 100) / 100,
    credit: Math.round((creditByCustomer.get(c.id) ?? 0) * 100) / 100,
  }));

  const recordedPayment = recorded.data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Receive payment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Record one payment — a check or a transfer — and split it across a customer&apos;s open invoices.
          </p>
        </div>
        <Link href="/sales" className="text-sm font-medium text-primary hover:underline">
          ← Back to sales
        </Link>
      </div>

      {recordedPayment && (
        <div className="rounded-xl bg-positive/10 px-4 py-3 text-sm text-foreground" role="status">
          <span className="font-semibold">Payment recorded.</span> {formatMoney(recordedPayment.amount)} from{" "}
          {recordedPayment.contact?.display_name ?? "the customer"}
          {Number(recordedPayment.unapplied_amount) > 0
            ? ` — ${formatMoney(Number(recordedPayment.amount) - Number(recordedPayment.unapplied_amount))} applied to invoices, ${formatMoney(recordedPayment.unapplied_amount)} kept as credit.`
            : " — fully applied to invoices."}
        </div>
      )}

      {customers.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Payment details</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceivePaymentForm
              // remount with fresh state after each recorded payment
              key={recordedParam ?? "new"}
              tenantId={activeTenantId}
              customers={customers}
              openInvoices={openInvoices}
              defaultCustomerId={customers.some((c) => c.id === customerParam) ? customerParam : undefined}
              focusInvoiceId={invoiceParam}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Add a customer first.{" "}
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

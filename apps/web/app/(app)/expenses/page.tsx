import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { formatDate } from "@/lib/dates";
import { PURCHASE_DOCUMENTS, PURCHASE_STATUS_STYLE, isPurchaseDocumentType, purchaseStatusLabel } from "@/lib/documents";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Row = {
  key: string;
  href: string | null;
  reference: string;
  type: string;
  party: string;
  date: string;
  due: string;
  total: string;
  balance: string;
  statusLabel: string;
  statusClass: string;
  sortDate: string;
  createdAt: string;
};

const EXPENSE_STATUS: Record<string, { label: string; className: string }> = {
  posted: { label: "Paid", className: "bg-positive/15 text-positive" },
  verified: { label: "Verified", className: "bg-chart-2/15 text-chart-2" },
  draft: { label: "Draft", className: "bg-secondary text-secondary-foreground" },
};

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");
  const params = await searchParams;

  const supabase = await createClient();
  const [{ data: bills }, { data: expenses }] = await Promise.all([
    supabase
      .from("bills")
      .select("id, bill_number, document_type, issue_date, due_date, total, balance_due, status, created_at, vendor:contacts(display_name)")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("expenses")
      .select("id, expense_date, amount, memo, status, created_at, contact:contacts(display_name), account:accounts(name)")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false }),
  ]);

  const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const rows: Row[] = [
    ...(bills ?? []).map((b) => {
      const type = isPurchaseDocumentType(b.document_type) ? b.document_type : "bill";
      const isCredit = type === "vendor_credit";
      return {
        key: `bill_${b.id}`,
        href: `/expenses/${b.id}`,
        reference: b.bill_number ?? "—",
        type: PURCHASE_DOCUMENTS[type].label,
        party: b.vendor?.display_name ?? "—",
        date: b.issue_date,
        due: isCredit ? "—" : b.due_date ? formatDate(b.due_date) : "No due date",
        total: isCredit ? `−${currency(Number(b.total))}` : currency(Number(b.total)),
        balance: isCredit ? `${currency(Number(b.balance_due))} left` : currency(Number(b.balance_due)),
        statusLabel: purchaseStatusLabel(type, b.status),
        statusClass: PURCHASE_STATUS_STYLE[b.status] ?? "",
        sortDate: b.issue_date,
        createdAt: b.created_at,
      };
    }),
    ...(expenses ?? []).map((e) => {
      const status = EXPENSE_STATUS[e.status] ?? { label: e.status, className: "" };
      return {
        key: `expense_${e.id}`,
        href: null,
        reference: e.memo ?? e.account?.name ?? "Expense",
        type: "Expense",
        party: e.contact?.display_name ?? "—",
        date: e.expense_date,
        due: "—",
        total: currency(Number(e.amount)),
        balance: "—",
        statusLabel: status.label,
        statusClass: status.className,
        sortDate: e.expense_date,
        createdAt: e.created_at,
      };
    }),
  ].sort((a, b) => b.sortDate.localeCompare(a.sortDate) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Supplier bills, credits, payments, and paid expenses.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/expenses/pay-bills"
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted"
          >
            Pay bills
          </Link>
          <Link
            href="/expenses/new?type=bill"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
          >
            + New Bill
          </Link>
        </div>
      </div>

      {params.recorded === "expense" && (
        <div className="rounded-xl bg-positive/10 px-4 py-3 text-sm text-foreground" role="status">
          <span className="font-semibold">Expense recorded</span> and posted as paid.
        </div>
      )}

      <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="overflow-x-auto rounded-xl bg-card p-4">
          {rows.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Reference</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Supplier</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Due date</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 text-right font-medium">Balance</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/60 last:border-0">
                    <td className="max-w-48 truncate py-2 pr-4">
                      {r.href ? (
                        <Link href={r.href} className="font-medium text-primary hover:underline">
                          {r.reference}
                        </Link>
                      ) : (
                        <span className="text-foreground">{r.reference}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.type}</td>
                    <td className="py-2 pr-4">{r.party}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.due}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.total}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.balance}</td>
                    <td className="py-2">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${r.statusClass}`}>{r.statusLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No bills or expenses yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

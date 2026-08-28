import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-chart-2/15 text-chart-2",
  scheduled: "bg-warning/15 text-warning",
  partial: "bg-warning/15 text-warning",
  paid: "bg-positive/15 text-positive",
  void: "bg-muted text-muted-foreground",
};

export default async function ExpensesPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const { data: bills } = await supabase
    .from("bills")
    .select("id, bill_number, issue_date, due_date, total, balance_due, status, vendor:contacts(display_name)")
    .eq("tenant_id", activeTenantId)
    .order("created_at", { ascending: false });

  const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vendor bills and payments.</p>
        </div>
        <Link
          href="/expenses/new"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
        >
          + New Bill
        </Link>
      </div>

      <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="overflow-x-auto rounded-xl bg-card p-4">
          {bills?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Bill #</th>
                  <th className="py-2 pr-4 font-medium">Vendor</th>
                  <th className="py-2 pr-4 font-medium">Issue date</th>
                  <th className="py-2 pr-4 font-medium">Due date</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 text-right font-medium">Balance</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4">
                      <Link href={`/expenses/${b.id}`} className="font-medium text-primary hover:underline">
                        {b.bill_number ?? "—"}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{b.vendor?.display_name ?? "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{b.issue_date}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{b.due_date}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{currency(b.total)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{currency(b.balance_due)}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[b.status] ?? ""}`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No bills yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function JournalEntriesPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("journal_entries")
    .select(
      "id, entry_date, memo, source_type, status, journal_entry_lines(id, debit, credit, account:accounts(code, name))",
    )
    .eq("tenant_id", activeTenantId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Link href="/cpa/journal-entries/new">
          <Button>New journal entry</Button>
        </Link>
      </div>

      {(entries ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No journal entries yet.</p>
      ) : (
        (entries ?? []).map((entry) => {
          const total = entry.journal_entry_lines.reduce(
            (sum, l) => sum + Number(l.debit),
            0,
          );
          return (
            <Card key={entry.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-medium">
                  <span>
                    {entry.entry_date} — {entry.memo || "(no memo)"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ${total.toFixed(2)} · {entry.status}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {entry.journal_entry_lines.map((line) => (
                      <tr key={line.id} className="border-b border-border/60 last:border-0">
                        <td className="py-1 pr-4 font-mono text-muted-foreground">
                          {line.account?.code}
                        </td>
                        <td className="py-1 pr-4">{line.account?.name}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">
                          {Number(line.debit) > 0 ? `$${Number(line.debit).toFixed(2)}` : ""}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {Number(line.credit) > 0 ? `$${Number(line.credit).toFixed(2)}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

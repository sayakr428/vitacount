import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewAccountForm } from "@/components/new-account-form";

const TYPE_LABEL: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

export default async function ChartOfAccountsPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name, type, subtype, is_active")
    .eq("tenant_id", activeTenantId)
    .order("code");

  const grouped = (accounts ?? []).reduce<Record<string, typeof accounts>>(
    (acc, account) => {
      (acc[account.type] ??= []).push(account);
      return acc;
    },
    {},
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add an account</CardTitle>
        </CardHeader>
        <CardContent>
          <NewAccountForm tenantId={activeTenantId} />
        </CardContent>
      </Card>

      {Object.entries(TYPE_LABEL).map(([type, label]) => (
        <Card key={type}>
          <CardHeader>
            <CardTitle>{label}</CardTitle>
          </CardHeader>
          <CardContent>
            {grouped[type]?.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-4 font-medium">Code</th>
                    <th className="py-1 pr-4 font-medium">Name</th>
                    <th className="py-1 font-medium">Subtype</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[type].map((a) => (
                    <tr key={a.id} className="border-b border-border/60">
                      <td className="py-1.5 pr-4 font-mono text-muted-foreground">{a.code}</td>
                      <td className="py-1.5 pr-4">{a.name}</td>
                      <td className="py-1.5 text-muted-foreground">{a.subtype ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">No accounts yet.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

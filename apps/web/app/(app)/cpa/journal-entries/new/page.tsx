import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewJournalEntryForm } from "@/components/new-journal-entry-form";

export default async function NewJournalEntryPage() {
  const { activeTenantId, role } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  if (!role || !["owner", "admin", "accountant"].includes(role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not authorized</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only owners, admins, and accountants can post journal entries.
          </p>
        </CardContent>
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name")
    .eq("tenant_id", activeTenantId)
    .eq("is_active", true)
    .order("code");

  return (
    <Card>
      <CardHeader>
        <CardTitle>New journal entry</CardTitle>
      </CardHeader>
      <CardContent>
        <NewJournalEntryForm tenantId={activeTenantId} accounts={accounts ?? []} />
      </CardContent>
    </Card>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewContactForm } from "@/components/new-contact-form";

const TYPE_LABEL: Record<string, string> = {
  customer: "Customer",
  vendor: "Vendor",
  both: "Customer & Vendor",
};

export default async function ContactsPage() {
  const { activeTenantId } = await loadTenantContext();
  if (!activeTenantId) redirect("/onboarding");

  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, display_name, type, email, phone, payment_terms, is_1099_vendor")
    .eq("tenant_id", activeTenantId)
    .order("display_name");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Customers and vendors for this workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a contact</CardTitle>
        </CardHeader>
        <CardContent>
          <NewContactForm tenantId={activeTenantId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Phone</th>
                    <th className="py-2 pr-4 font-medium">Terms</th>
                    <th className="py-2 font-medium">1099</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-medium">{c.display_name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{TYPE_LABEL[c.type] ?? c.type}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.email ?? "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.phone ?? "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.payment_terms}</td>
                      <td className="py-2 text-muted-foreground">{c.is_1099_vendor ? "Yes" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contacts yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

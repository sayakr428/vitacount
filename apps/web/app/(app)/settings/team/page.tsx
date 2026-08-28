import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm } from "@/components/invite-form";

export default async function TeamSettingsPage() {
  const supabase = await createClient();
  const { activeTenantId, activeTenant, role } = await loadTenantContext();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, user_id, role, status, invited_at")
    .eq("tenant_id", activeTenantId!)
    .order("invited_at", { ascending: true });

  const userIds = (memberships ?? []).map((m) => m.user_id);
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null }[] };

  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const canManage = role === "owner" || role === "admin";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Team — {activeTenant?.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {canManage
          ? "Invite teammates and manage their access."
          : "Only owners and admins can invite teammates."}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {(memberships ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span>{nameByUserId.get(m.user_id) ?? "Pending profile"}</span>
                <span className="text-sm text-zinc-500">
                  {m.role}
                  {m.status !== "active" ? ` · ${m.status}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canManage && activeTenantId ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm tenantId={activeTenantId} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

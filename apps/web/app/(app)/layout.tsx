import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTenantContext } from "@/lib/tenant/data";
import { TenantProvider } from "@/lib/tenant/context";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { memberships, activeTenantId, activeTenant, role } =
    await loadTenantContext();

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <TenantProvider value={{ memberships, activeTenantId, activeTenant, role }}>
      <div className="flex min-h-full flex-1 bg-background">
        <Sidebar planName={`${activeTenant?.plan_tier ?? "Starter"} Plan`} />
        <div className="flex min-h-full flex-1 flex-col">
          <Header fullName={profile?.full_name ?? null} />
          <main className="flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
        </div>
      </div>
    </TenantProvider>
  );
}

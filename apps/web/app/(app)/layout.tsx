import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/supabase/user";
import { loadTenantContext } from "@/lib/tenant/data";
import { TenantProvider } from "@/lib/tenant/context";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { ModuleTabs } from "@/components/module-tabs";
import { VitaDockLoader } from "@/components/agent/vita-dock-loader";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Independent lookups, fetched together rather than one round trip after another.
  const [{ memberships, activeTenantId, activeTenant, role }, profile] = await Promise.all([
    loadTenantContext(),
    getCurrentProfile(user.id),
  ]);

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  return (
    <TenantProvider value={{ memberships, activeTenantId, activeTenant, role }}>
      <div className="flex min-h-full flex-1 bg-background">
        <Sidebar
          fullName={profile?.full_name ?? null}
          planName={`${activeTenant?.plan_tier ?? "Starter"} Plan`}
        />
        <div className="flex min-h-full min-w-0 flex-1 flex-col">
          <Header />
          <div className="px-4 pt-5 md:px-6">
            <ModuleTabs />
          </div>
          <main className="flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
        </div>
      </div>
      {/* Inlined at build time: with the flag off the dock is never referenced. */}
      {process.env.NEXT_PUBLIC_AGENT_ENABLED === "true" && <VitaDockLoader />}
    </TenantProvider>
  );
}

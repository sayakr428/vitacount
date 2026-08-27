import { redirect } from "next/navigation";
import { getUserMemberships } from "@/lib/tenant/data";

export default async function RootPage() {
  const memberships = await getUserMemberships();
  redirect(memberships.length > 0 ? "/dashboard" : "/onboarding");
}

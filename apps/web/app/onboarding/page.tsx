import { redirect } from "next/navigation";
import { getUserMemberships } from "@/lib/tenant/data";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const memberships = await getUserMemberships();

  if (memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
      <div className="w-full max-w-sm">
        <OnboardingForm />
      </div>
    </div>
  );
}

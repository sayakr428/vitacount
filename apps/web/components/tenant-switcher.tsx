"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchTenantAction } from "@/lib/tenant/actions";
import { useTenant } from "@/lib/tenant/context";

export function TenantSwitcher() {
  const { activeTenantId, memberships } = useTenant();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    return (
      <span className="text-sm font-medium">
        {memberships[0]?.tenant?.name ?? "Untitled workspace"}
      </span>
    );
  }

  return (
    <select
      className="rounded-md border border-border bg-card px-2 py-1 text-sm"
      value={activeTenantId ?? ""}
      disabled={pending}
      onChange={(event) => {
        const tenantId = event.target.value;
        startTransition(async () => {
          await switchTenantAction(tenantId);
          router.refresh();
        });
      }}
    >
      {memberships.map((m) => (
        <option key={m.tenant_id} value={m.tenant_id}>
          {m.tenant?.name ?? "Untitled workspace"}
        </option>
      ))}
    </select>
  );
}

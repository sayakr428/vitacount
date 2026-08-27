"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MembershipSummary, TenantSummary } from "@/lib/tenant/data";

type TenantContextValue = {
  activeTenantId: string | null;
  activeTenant: TenantSummary | null;
  role: string | null;
  memberships: MembershipSummary[];
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  value,
  children,
}: {
  value: TenantContextValue;
  children: ReactNode;
}) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}

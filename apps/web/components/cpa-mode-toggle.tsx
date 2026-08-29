"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ShieldCheck, UserCheck } from "lucide-react";

export function CPAModeToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const isCPAMode = pathname.startsWith("/cpa");

  function handleToggle() {
    if (isCPAMode) {
      router.push("/dashboard");
    } else {
      router.push("/cpa/journal-entries");
    }
  }

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
        isCPAMode
          ? "bg-warning/15 text-warning border border-warning/30"
          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      title={isCPAMode ? "Switch to Owner Mode (Visual KPIs)" : "Switch to CPA Mode (Raw Ledger & Debits/Credits)"}
    >
      {isCPAMode ? <ShieldCheck className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
      <span>{isCPAMode ? "CPA Mode" : "Owner Mode"}</span>
    </button>
  );
}

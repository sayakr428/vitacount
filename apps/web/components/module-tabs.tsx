"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const icons = {
  home: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M4 11.5 12 4l8 7.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />
    </svg>
  ),
  moneyIn: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M6 16 12 8l6 8M12 8v11" />
    </svg>
  ),
  moneyOut: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M6 8 12 16l6-8M12 16V5" />
    </svg>
  ),
  cashFlow: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M3.5 15 9 9.5l4 4 7.5-8" />
      <path d="M20.5 5.5v5M20.5 5.5h-5" />
    </svg>
  ),
  projects: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" />
    </svg>
  ),
  inventory: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </svg>
  ),
  reports: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M6 20V10M12 20V4M18 20v-7" />
    </svg>
  ),
  cpa: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M12 3.5 4.5 6.5v5c0 4.5 3 7.5 7.5 9 4.5-1.5 7.5-4.5 7.5-9v-5Z" />
    </svg>
  ),
};

type Tab = {
  label: string;
  caption: string;
  href: string;
  icon: (props: SVGProps<SVGSVGElement>) => React.ReactNode;
  isActive: (pathname: string) => boolean;
};

const tabs: Tab[] = [
  { label: "Dashboard", caption: "Overview", href: "/dashboard", icon: icons.home, isActive: (p) => p === "/dashboard" },
  { label: "Money In", caption: "Income & AR", href: "/sales", icon: icons.moneyIn, isActive: (p) => p.startsWith("/sales") },
  { label: "Money Out", caption: "Expenses & AP", href: "/expenses", icon: icons.moneyOut, isActive: (p) => p.startsWith("/expenses") },
  { label: "Net Cash Flow", caption: "Cash & forecast", href: "/banking", icon: icons.cashFlow, isActive: (p) => p.startsWith("/banking") },
  { label: "Projects", caption: "Profitability", href: "/projects", icon: icons.projects, isActive: (p) => p.startsWith("/projects") },
  { label: "Inventory", caption: "FIFO & stock", href: "/inventory", icon: icons.inventory, isActive: (p) => p.startsWith("/inventory") },
  { label: "Reports", caption: "Analytics", href: "/reports", icon: icons.reports, isActive: (p) => p.startsWith("/reports") },
  { label: "CPA Mode", caption: "Advanced view", href: "/cpa/journal-entries", icon: icons.cpa, isActive: (p) => p.startsWith("/cpa") },
];

export function ModuleTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Modules" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      {tabs.map((tab) => {
        const active = tab.isActive(pathname);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`flex shrink-0 items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 transition-all duration-200 ${
              active
                ? "border-primary/15 bg-primary/8 shadow-soft-sm"
                : "border-border/70 bg-card hover:border-primary/20 hover:bg-primary/5"
            }`}
          >
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="size-4" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className={`text-xs font-semibold ${active ? "text-foreground" : "text-foreground/80"}`}>{tab.label}</span>
              <span className="text-[10.5px] text-muted-foreground">{tab.caption}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

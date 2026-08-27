"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, SVGProps } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  badge?: string;
};

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const icons = {
  dashboard: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  ),
  transactions: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  ),
  sales: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M4 19h16M6 19V9l4-3 4 3v10M14 19v-6l4-2v8" />
    </svg>
  ),
  expenses: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2" />
      <path d="M3.5 10.5h17M7 15h3" />
    </svg>
  ),
  banking: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M3.5 9.5 12 4l8.5 5.5M5 9.5v8M9.5 9.5v8M14.5 9.5v8M19 9.5v8M3.5 19.5h17" />
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
  forecasting: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M3.5 17 9 11.5l4 4 7.5-8.5M20.5 7v5M20.5 7h-5" />
    </svg>
  ),
  documents: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="M7 3.5h7L18.5 8V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4.5" />
    </svg>
  ),
  reconciliation: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <path d="m6 12 3.5 3.5L18 7" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  ),
  contacts: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 9.5c1.66 0 3-1.34 3-3M15 15c2.5 0 4.5 1.7 4.5 4.5" />
    </svg>
  ),
  settings: (p: SVGProps<SVGSVGElement>) => (
    <svg {...iconProps} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3" />
    </svg>
  ),
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: icons.dashboard },
  { label: "Transactions", href: "/transactions", icon: icons.transactions },
  { label: "Sales", href: "/sales", icon: icons.sales },
  { label: "Expenses", href: "/expenses", icon: icons.expenses },
  { label: "Banking", href: "/banking", icon: icons.banking },
  { label: "Projects", href: "/projects", icon: icons.projects },
  { label: "Inventory", href: "/inventory", icon: icons.inventory },
  { label: "Reports", href: "/reports", icon: icons.reports },
  { label: "Forecasting", href: "/forecasting", icon: icons.forecasting },
  { label: "Documents", href: "/documents", icon: icons.documents },
  { label: "Reconciliation", href: "/reconciliation", icon: icons.reconciliation, badge: "12" },
  { label: "Contacts", href: "/contacts", icon: icons.contacts },
];

const bottomNav: NavItem[] = [
  { label: "Settings", href: "/settings/team", icon: icons.settings },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-200 ${
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
      )}
      <Icon className="size-[18px] shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-secondary-foreground">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ planName = "Starter Plan" }: { planName?: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 md:flex">
      <div className="flex flex-1 flex-col gap-0.5">
        {primaryNav.map((item) => (
          <NavRow key={item.label} item={item} active={pathname === item.href} />
        ))}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
        {bottomNav.map((item) => (
          <NavRow key={item.label} item={item} active={pathname === item.href} />
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-foreground/5 p-1 ring-1 ring-foreground/10">
        <div className="rounded-xl bg-card p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            {planName}
          </span>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">API Calls</dt>
              <dd className="tabular-nums font-medium">1,204</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Statement Lines</dt>
              <dd className="tabular-nums font-medium">3,890</dd>
            </div>
          </dl>
          <Link
            href="/settings/team"
            className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
          >
            View usage details →
          </Link>
        </div>
      </div>
    </aside>
  );
}

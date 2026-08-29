"use client";

import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CPAModeToggle } from "@/components/cpa-mode-toggle";
import { LogoMark } from "@/components/logo-mark";
import { NewMenu } from "@/components/new-menu";
import { useTenant } from "@/lib/tenant/context";

export function Header({ fullName }: { fullName: string | null }) {
  const { role } = useTenant();
  const initial = (fullName ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="sticky top-4 z-30 mx-4 mt-4 md:mx-6">
      <header className="flex items-center justify-between gap-4 rounded-full border border-border/70 bg-card/85 px-3 py-2 shadow-soft-sm backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 pl-1 font-heading text-[15px] font-semibold tracking-tight">
            <LogoMark />
            VitaCount
          </Link>
          <TenantSwitcher />
        </div>

        <div className="hidden flex-1 max-w-md items-center gap-2 rounded-full bg-muted/70 px-4 py-2 text-sm text-muted-foreground transition-colors duration-200 focus-within:bg-muted md:flex">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4 shrink-0">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path strokeLinecap="round" d="m20 20-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Navigate. Find transactions, contacts, reports, and more."
            className="w-full truncate bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <nav className="flex items-center gap-2 text-sm">
          <NewMenu />
          <CPAModeToggle />
          <ThemeToggle />
          <Link
            href="/settings/team"
            className="hidden rounded-full px-3 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground sm:inline-block"
          >
            Team
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="cursor-pointer rounded-full px-3 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground"
            >
              Log out
            </button>
          </form>
          <div className="flex items-center gap-2 rounded-full bg-muted py-1 pl-1 pr-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[11px] font-medium">
              {initial}
            </span>
            <span className="hidden text-xs text-muted-foreground lg:inline">
              {fullName ?? "You"}
              {role ? ` · ${role}` : ""}
            </span>
          </div>
        </nav>
      </header>
    </div>
  );
}

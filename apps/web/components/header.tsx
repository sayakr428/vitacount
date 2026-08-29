"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { CPAModeToggle } from "@/components/cpa-mode-toggle";
import { NewMenu } from "@/components/new-menu";

export function Header() {
  return (
    <div className="sticky top-4 z-30 mx-4 mt-4 md:mx-6">
      <header className="flex items-center justify-between gap-4 rounded-full border border-border/70 bg-card/85 px-3 py-2 shadow-soft-sm backdrop-blur-xl">
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
        </nav>
      </header>
    </div>
  );
}

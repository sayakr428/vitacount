"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type MenuItem = { label: string; description: string; href: string };
type MenuSection = { title: string; viewAll: { label: string; href: string }; items: MenuItem[] };

// Customers and suppliers mirror each other: bill later / paid now / money moves / adjustments.
const sections: MenuSection[] = [
  {
    title: "Customers",
    viewAll: { label: "All sales", href: "/sales" },
    items: [
      { label: "Invoice", description: "Bill a customer, get paid later", href: "/sales/new?type=invoice" },
      { label: "Sales receipt", description: "A sale paid on the spot", href: "/sales/new?type=sales_receipt" },
      { label: "Payment received", description: "Money in — split across invoices", href: "/sales/receive-payment" },
      { label: "Refund", description: "Give money back to a customer", href: "/sales/new?type=refund_receipt" },
      { label: "Debit note", description: "Add a charge to what they owe", href: "/sales/new?type=debit_note" },
    ],
  },
  {
    title: "Suppliers",
    viewAll: { label: "All expenses", href: "/expenses" },
    items: [
      { label: "Bill", description: "A supplier invoice to pay later", href: "/expenses/new?type=bill" },
      { label: "Expense", description: "Something already paid for", href: "/expenses/new?type=expense" },
      { label: "Payment made", description: "Pay one or more bills at once", href: "/expenses/pay-bills" },
      { label: "Supplier credit", description: "A credit or debit note from a supplier", href: "/expenses/new?type=vendor_credit" },
    ],
  },
];

export function NewMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background transition-transform duration-200 active:scale-[0.97] hover:opacity-90"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5" aria-hidden="true">
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
        New
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-40 mt-2 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
        >
          <div className="grid grid-cols-1 gap-px bg-border/60 sm:grid-cols-2">
            {sections.map((section) => (
              <nav key={section.title} aria-label={`New ${section.title.toLowerCase()} transaction`} className="bg-card p-2">
                <div className="flex items-baseline justify-between px-2.5 pb-1.5 pt-1">
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h3>
                  <Link
                    href={section.viewAll.href}
                    onClick={() => setOpen(false)}
                    className="text-[10.5px] font-medium text-primary hover:underline"
                  >
                    {section.viewAll.label} →
                  </Link>
                </div>
                <ul>
                  {section.items.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-xl px-2.5 py-2 transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      >
                        <span className="block text-xs font-semibold text-foreground">{item.label}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{item.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border/70 bg-muted/30 px-4 py-2">
            <span className="text-[11px] text-muted-foreground">Someone new?</span>
            <Link
              href="/contacts"
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-foreground hover:text-primary"
            >
              + Add a customer or supplier
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

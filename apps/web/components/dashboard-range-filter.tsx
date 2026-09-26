"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { diffDays, formatDateRange, isISODate } from "@/lib/dates";
import {
  MAX_CUSTOM_RANGE_DAYS,
  RANGE_PRESETS,
  resolveDashboardRange,
  type DashboardRange,
  type RangePreset,
} from "@/lib/date-range";

// Presets grouped the way people think about them: rolling windows, calendar periods, a year.
const GROUPS: RangePreset[][] = [
  ["last_7_days", "last_30_days", "last_90_days"],
  ["this_month", "last_month", "this_quarter", "last_quarter"],
  ["this_year", "last_year", "last_12_months"],
];

interface DashboardRangeFilterProps {
  range: DashboardRange;
  pending: boolean;
  onChange: (params: Record<string, string | null>) => void;
}

export function DashboardRangeFilter({ range, pending, onChange }: DashboardRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Each preset's concrete dates, so "This year" visibly means Jan 1 – Dec 31.
  const presetSpans = useMemo(() => {
    const spans = new Map<string, string>();
    for (const p of RANGE_PRESETS) {
      const r = resolveDashboardRange({ range: p.value });
      spans.set(p.value, formatDateRange(r.from, r.to));
    }
    return spans;
  }, []);

  function toggle() {
    setOpen((o) => {
      if (!o) {
        setFrom(range.from);
        setTo(range.to);
        setError(null);
      }
      return !o;
    });
  }

  function choosePreset(preset: RangePreset) {
    setOpen(false);
    onChange({ range: preset, from: null, to: null, group: null });
  }

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!isISODate(from) || !isISODate(to)) {
      setError("Pick both a start and an end date.");
      return;
    }
    if (from > to) {
      setError("The start date must be on or before the end date.");
      return;
    }
    if (diffDays(from, to) >= MAX_CUSTOM_RANGE_DAYS) {
      setError("Pick a range of 5 years or less.");
      return;
    }
    setOpen(false);
    onChange({ range: "custom", from, to, group: null });
  }

  const labelById = new Map(RANGE_PRESETS.map((p) => [p.value as string, p.label]));

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-soft-sm transition-colors duration-200 hover:bg-foreground/5"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5 text-muted-foreground" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path strokeLinecap="round" d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
        </svg>
        <span>{range.label}</span>
        <span className="hidden text-muted-foreground sm:inline">{formatDateRange(range.from, range.to)}</span>
        {pending ? (
          <span className="size-3 animate-spin rounded-full border-[1.5px] border-muted-foreground/40 border-t-foreground" aria-label="Loading" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-soft"
        >
          {GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-1 border-t border-border/70 pt-1" : ""}>
              {group.map((preset) => {
                const selected = range.preset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => choosePreset(preset)}
                    aria-current={selected ? "true" : undefined}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-muted/70"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
                      {selected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4 text-primary">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </span>
                    <span className={selected ? "font-semibold text-foreground" : "text-foreground"}>{labelById.get(preset)}</span>
                    <span className="ml-auto text-[10.5px] text-muted-foreground">{presetSpans.get(preset)}</span>
                  </button>
                );
              })}
            </div>
          ))}

          <form onSubmit={applyCustom} className="mt-1 border-t border-border/70 px-2.5 pb-1.5 pt-2.5">
            <p className="flex items-center gap-2 text-xs font-medium text-foreground">
              {range.preset === "custom" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4 text-primary" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              )}
              Custom range
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
                />
              </label>
            </div>
            {error && (
              <p className="mt-2 text-[11px] text-destructive" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="mt-2.5 w-full cursor-pointer rounded-full bg-primary py-1.5 text-xs font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90"
            >
              Apply range
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

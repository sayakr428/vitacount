"use client";

import { normalizePercentText, parsePercent, sanitizePercentInput } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A rate typed the way people say it: "10" means 10%. The % sign is a fixed suffix,
 * so typing one (or a letter, or a space) is simply dropped instead of breaking the
 * calculation, and a comma decimal ("8,5") is accepted. The parent stores the
 * percent text; convert with `parsePercent(text).percent / 100` when saving.
 */
export function PercentInput({
  value,
  onChange,
  className,
  id,
  "aria-label": ariaLabel = "Tax rate (percent)",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const parsed = parsePercent(value);
  const error = parsed.ok ? null : parsed.error;

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(sanitizePercentInput(e.target.value))}
        onBlur={() => onChange(normalizePercentText(value))}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        title={error ?? undefined}
        className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pl-2.5 pr-6 text-right text-base tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30"
        placeholder="0"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground" aria-hidden="true">
        %
      </span>
      {error && (
        <span className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-destructive px-1.5 py-0.5 text-[10.5px] font-medium text-white" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Calendar-date helpers. Dates are plain "YYYY-MM-DD" strings — the shape Postgres
 * `date` columns round-trip as — and all arithmetic happens in UTC so results never
 * drift by the server's or browser's timezone offset.
 */
export type ISODate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return toISODate(d) === value;
}

export function parseISODate(value: ISODate): Date {
  const m = ISO_DATE.exec(value);
  if (!m) throw new Error(`Not an ISO date: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

/** Today as the rest of the app computes it (UTC calendar date). */
export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function addDays(value: ISODate, days: number): ISODate {
  return toISODate(new Date(parseISODate(value).getTime() + days * DAY_MS));
}

/** Adds calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(value: ISODate, months: number): ISODate {
  const d = parseISODate(value);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toISODate(target);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / DAY_MS);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function startOfMonth(value: ISODate): ISODate {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(value), 1), -1);
}

export function startOfQuarter(value: ISODate): ISODate {
  const month = Number(value.slice(5, 7));
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${value.slice(0, 4)}-${String(quarterStartMonth).padStart(2, "0")}-01`;
}

export function startOfYear(value: ISODate): ISODate {
  return `${value.slice(0, 4)}-01-01`;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayMonthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Sep 24, 2026" */
export function formatDate(value: ISODate | null | undefined): string {
  if (!value || !isISODate(value)) return "—";
  return dateFormatter.format(parseISODate(value));
}

/** "Sep 1 – Sep 24, 2026", or "Dec 1, 2025 – Jan 31, 2026" across years. */
export function formatDateRange(from: ISODate, to: ISODate): string {
  if (from === to) return formatDate(from);
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return `${dayMonthFormatter.format(parseISODate(from))} – ${formatDate(to)}`;
  }
  return `${formatDate(from)} – ${formatDate(to)}`;
}

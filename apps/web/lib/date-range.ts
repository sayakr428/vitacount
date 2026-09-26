import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  formatDateRange,
  isISODate,
  minDate,
  parseISODate,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  todayISO,
  type ISODate,
} from "@/lib/dates";

export const RANGE_PRESETS = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "last_12_months", label: "Last 12 months" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["value"] | "custom";
export type Granularity = "day" | "week" | "month" | "quarter";

export const DEFAULT_RANGE_PRESET: Exclude<RangePreset, "custom"> = "last_30_days";
/** Longest custom range the dashboard will aggregate. */
export const MAX_CUSTOM_RANGE_DAYS = 366 * 5;
/** Past this many buckets a grouped bar chart turns into a comb. */
const MAX_BUCKETS = 45;

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

export interface DashboardRange {
  preset: RangePreset;
  label: string;
  /** The period on screen. Calendar presets ("This year") run to the period's end, past today. */
  from: ISODate;
  to: ISODate;
  /** Last day that can hold actuals: min(to, today). */
  dataTo: ISODate;
  /** The previous period of the same shape (last month, last year, the prior N days). */
  compareFrom: ISODate;
  compareTo: ISODate;
  /** Like-for-like end inside the previous period, so a half-finished month isn't compared to a whole one. */
  compareDataTo: ISODate;
  granularity: Granularity;
  autoGranularity: Granularity;
  granularityOptions: Granularity[];
  compare: boolean;
}

export interface RangeSearchParams {
  range?: string;
  from?: string;
  to?: string;
  group?: string;
  compare?: string;
}

type Period = { from: ISODate; to: ISODate; compareFrom: ISODate; compareTo: ISODate; shiftMonths: number | null };

function rollingDays(today: ISODate, days: number): Period {
  const from = addDays(today, -(days - 1));
  return { from, to: today, compareFrom: addDays(from, -days), compareTo: addDays(from, -1), shiftMonths: null };
}

function calendar(from: ISODate, months: number): Period {
  const to = addDays(addMonths(from, months), -1);
  return { from, to, compareFrom: addMonths(from, -months), compareTo: addDays(from, -1), shiftMonths: months };
}

function presetPeriod(preset: Exclude<RangePreset, "custom">, today: ISODate): Period {
  switch (preset) {
    case "last_7_days":
      return rollingDays(today, 7);
    case "last_30_days":
      return rollingDays(today, 30);
    case "last_90_days":
      return rollingDays(today, 90);
    case "this_month":
      return calendar(startOfMonth(today), 1);
    case "last_month":
      return calendar(addMonths(startOfMonth(today), -1), 1);
    case "this_quarter":
      return calendar(startOfQuarter(today), 3);
    case "last_quarter":
      return calendar(addMonths(startOfQuarter(today), -3), 3);
    case "this_year":
      return calendar(startOfYear(today), 12);
    case "last_year":
      return calendar(addMonths(startOfYear(today), -12), 12);
    case "last_12_months": {
      // The current month plus the 11 before it: twelve clean month buckets.
      const from = addMonths(startOfMonth(today), -11);
      return { ...calendar(from, 12), to: endOfMonth(today) };
    }
  }
}

function customPeriod(from: ISODate, to: ISODate): Period {
  const days = diffDays(from, to) + 1;
  return { from, to, compareFrom: addDays(from, -days), compareTo: addDays(from, -1), shiftMonths: null };
}

function isPreset(value: string | undefined): value is Exclude<RangePreset, "custom"> {
  return RANGE_PRESETS.some((p) => p.value === value);
}

export function autoGranularity(from: ISODate, to: ISODate): Granularity {
  const span = diffDays(from, to) + 1;
  if (span <= 31) return "day";
  if (span <= 120) return "week";
  if (span <= 1100) return "month";
  return "quarter";
}

export function resolveDashboardRange(params: RangeSearchParams, today: ISODate = todayISO()): DashboardRange {
  let preset: RangePreset = DEFAULT_RANGE_PRESET;
  let period: Period;

  const customIsValid =
    params.range === "custom" &&
    isISODate(params.from) &&
    isISODate(params.to) &&
    params.from <= params.to &&
    diffDays(params.from, params.to) < MAX_CUSTOM_RANGE_DAYS;

  if (customIsValid) {
    preset = "custom";
    period = customPeriod(params.from as ISODate, params.to as ISODate);
  } else {
    const chosen = isPreset(params.range) ? params.range : DEFAULT_RANGE_PRESET;
    preset = chosen;
    period = presetPeriod(chosen, today);
  }

  const dataTo = minDate(period.to, today);
  const compareDataTo =
    period.shiftMonths !== null
      ? minDate(addMonths(dataTo, -period.shiftMonths), period.compareTo)
      : minDate(addDays(period.compareFrom, Math.max(0, diffDays(period.from, dataTo))), period.compareTo);

  const auto = autoGranularity(period.from, period.to);
  const granularityOptions = (["day", "week", "month", "quarter"] as Granularity[]).filter(
    (g) => g === auto || buildBuckets(period.from, period.to, g).length <= MAX_BUCKETS,
  );
  const requested = params.group as Granularity | undefined;
  const granularity = requested && granularityOptions.includes(requested) ? requested : auto;

  return {
    preset,
    label: preset === "custom" ? "Custom range" : RANGE_PRESETS.find((p) => p.value === preset)!.label,
    from: period.from,
    to: period.to,
    dataTo,
    compareFrom: period.compareFrom,
    compareTo: period.compareTo,
    compareDataTo,
    granularity,
    autoGranularity: auto,
    granularityOptions,
    compare: params.compare === "1",
  };
}

/** Human description of the comparison window used by the KPI deltas. */
export function comparisonLabel(range: DashboardRange): string {
  return formatDateRange(range.compareFrom, range.compareDataTo);
}

export interface Bucket {
  start: ISODate;
  end: ISODate;
  label: string;
}

const monthShort = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const dayShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Splits [from, to] into chart buckets. Days, months and quarters follow the
 * calendar; weeks are 7-day runs counted from `from`, so the same bucket index in
 * the current and previous period always covers the same slice of each.
 */
export function buildBuckets(from: ISODate, to: ISODate, granularity: Granularity): Bucket[] {
  const buckets: Bucket[] = [];
  const multiYear = from.slice(0, 4) !== to.slice(0, 4);
  let start = from;
  // hard stop protects against a bad range ever looping unbounded
  for (let guard = 0; start <= to && guard < 2000; guard++) {
    let next: ISODate;
    let label: string;
    const date = parseISODate(start);
    switch (granularity) {
      case "day":
        next = addDays(start, 1);
        label = dayShort.format(date);
        break;
      case "week":
        next = addDays(start, 7);
        label = dayShort.format(date);
        break;
      case "month":
        next = addMonths(startOfMonth(start), 1);
        label = monthShort.format(date) + (multiYear ? ` '${start.slice(2, 4)}` : "");
        break;
      case "quarter":
        next = addMonths(startOfQuarter(start), 3);
        label = `Q${Math.floor(date.getUTCMonth() / 3) + 1} '${start.slice(2, 4)}`;
        break;
    }
    const end = minDate(addDays(next, -1), to);
    buckets.push({ start, end, label });
    start = next;
  }
  return buckets;
}

/** Index of the bucket containing `date`, or -1 when it falls outside them all. */
export function bucketIndex(buckets: Bucket[], date: ISODate): number {
  // Buckets are contiguous and sorted; a binary search keeps a year of daily lines cheap.
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (date < buckets[mid].start) hi = mid - 1;
    else if (date > buckets[mid].end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

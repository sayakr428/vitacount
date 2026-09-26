/**
 * Money math for form previews that must agree to the cent with what Postgres
 * stores. Inputs stay decimal strings and are scaled to BigInt, so 1.005 rounds the
 * way `round(1.005, 2)` does (1.01) instead of the way a float does (1.00).
 */

const DECIMAL = /^\d*\.?\d*$/;

/** "12.345" at scale 2 -> 1235n (half-up). null when the text isn't a plain non-negative decimal. */
export function toScaled(value: string, scale: number): bigint | null {
  const text = value.trim();
  if (text === "" || text === "." || !DECIMAL.test(text)) return null;
  const [intPart = "", fracPart = ""] = text.split(".");
  const kept = fracPart.slice(0, scale).padEnd(scale, "0");
  const scaled = BigInt((intPart || "0") + kept);
  const nextDigit = fracPart.charCodeAt(scale) - 48; // NaN when there is no next digit
  return nextDigit >= 5 ? scaled + BigInt(1) : scaled;
}

function scaledToNumber(value: bigint, scale: number): number {
  return Number(value) / 10 ** scale;
}

/** 1235n at scale 2 -> "12.35". Exact — safe to hand to a Postgres numeric. */
export function scaledToString(value: bigint, scale: number): string {
  const digits = value.toString().padStart(scale + 1, "0");
  return scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/** Normalizes a typed amount ("019.9" -> "19.90"); null if it isn't a plain non-negative number. */
export function normalizeAmount(value: string, scale = 2): string | null {
  const scaled = toScaled(value, scale);
  return scaled === null ? null : scaledToString(scaled, scale);
}

export interface TotalsLineInput {
  quantity: string;
  unitPrice: string;
  /** Percent, e.g. "8.875" for 8.875%. */
  taxRate?: string;
}

export interface DocumentTotals {
  amounts: number[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

/**
 * Mirrors create_sales_document: amount = round(qty * price, 2) per line,
 * tax = round(Σ amount × rate, 2) over the whole document, total = subtotal + tax.
 * Lines with unparseable numbers count as zero (the form flags them separately).
 */
export function computeDocumentTotals(lines: TotalsLineInput[]): DocumentTotals {
  const HUNDRED = BigInt(100);
  const MILLION = BigInt(1_000_000);
  let subtotalCents = BigInt(0);
  let taxMicroCents = BigInt(0); // cents × 10^-6

  const amounts = lines.map((line) => {
    const qty = toScaled(line.quantity, 2) ?? BigInt(0); // hundredths
    const price = toScaled(line.unitPrice, 2) ?? BigInt(0); // cents
    const rate = toScaled(line.taxRate ?? "0", 4) ?? BigInt(0); // percent × 10^4 = fraction × 10^6
    const amountCents = (qty * price + HUNDRED / BigInt(2)) / HUNDRED;
    subtotalCents += amountCents;
    taxMicroCents += amountCents * rate;
    return scaledToNumber(amountCents, 2);
  });

  const taxCents = (taxMicroCents + MILLION / BigInt(2)) / MILLION;
  return {
    amounts,
    subtotal: scaledToNumber(subtotalCents, 2),
    taxTotal: scaledToNumber(taxCents, 2),
    total: scaledToNumber(subtotalCents + taxCents, 2),
  };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(value: number | string | null | undefined): string {
  return usd.format(Number(value ?? 0));
}

// ---------------------------------------------------------------------------
// Percent inputs: "10" means 10%. Stored as a fraction (0.10) in the database.
// ---------------------------------------------------------------------------

/**
 * Keeps only what a rate can contain while the user types: digits and one decimal
 * point. A typed "%" (or spaces, or letters) is dropped instead of breaking the
 * math; a comma decimal ("8,5") becomes "8.5".
 */
export function sanitizePercentInput(raw: string): string {
  let seenPoint = false;
  let out = "";
  for (const ch of raw.replace(/,/g, ".")) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !seenPoint) {
      seenPoint = true;
      out += ch;
    }
  }
  return out;
}

export type PercentParse = { ok: true; percent: number } | { ok: false; error: string };

export function parsePercent(text: string): PercentParse {
  const clean = sanitizePercentInput(text);
  if (clean === "" || clean === ".") return { ok: true, percent: 0 };
  const percent = Number(clean);
  if (!Number.isFinite(percent)) return { ok: false, error: "Enter a number, like 8.25" };
  if (percent > 100) return { ok: false, error: "Tax can't be more than 100%" };
  const decimals = clean.split(".")[1]?.length ?? 0;
  if (decimals > 4) return { ok: false, error: "Use at most 4 decimal places" };
  return { ok: true, percent };
}

/** Normalizes on blur: "08.500" -> "8.5", "" -> "0". Leaves invalid text for the error to explain. */
export function normalizePercentText(text: string): string {
  const parsed = parsePercent(text);
  if (!parsed.ok) return sanitizePercentInput(text);
  return String(parsed.percent);
}

/** "8.875" (percent text) -> "0.088750" (the fraction the database stores), computed exactly. */
export function percentTextToFraction(text: string): string | null {
  const parsed = parsePercent(text);
  if (!parsed.ok) return null;
  const scaled = toScaled(sanitizePercentInput(text) || "0", 4);
  return scaled === null ? "0" : scaledToString(scaled, 6);
}

/** 0.0825 -> "8.25" */
export function fractionToPercentText(fraction: number | string | null | undefined): string {
  const value = Number(fraction ?? 0) * 100;
  return String(Math.round(value * 10_000) / 10_000);
}

export function formatPercent(fraction: number | string | null | undefined): string {
  return `${fractionToPercentText(fraction)}%`;
}

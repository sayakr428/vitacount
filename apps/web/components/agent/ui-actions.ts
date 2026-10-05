"use client";

/**
 * DOM side of Vita's on-screen actions. Pipecat's UIWorker picks the element;
 * these helpers act on it the way a person would, so the app's own React
 * handlers, validation and server actions run unchanged.
 */

// Everything Vita must never do on the user's behalf (spec: no deleting, no
// autonomy/kill-switch changes, no team or workspace changes, no sign-out).
const FORBIDDEN =
  /\b(delete|remove (member|user)|kill[- ]?switch|L[0-3] (off|draft|review|auto)|send invite|invite|log ?out|sign ?out|switch workspace)\b/i;

// Clicks that post to the ledger, move money or contact someone need the user
// to press Allow on screen first. Drafts and contacts are reversible and don't.
const CONSEQUENTIAL =
  /\b(send (invoice|debit note)|record (payment|bill|expense|refund)|pay( all| bills)?|post entry|save (sales receipt|refund)|approve( match)?|reject|verify|apply credit|connect sandbox|run reconciliation|sync feeds|run .*agent|create payment link|pay with card)\b/i;

export function elementLabel(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const label = el.labels?.[0]?.textContent;
    if (label) return label.trim();
  }
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function isForbidden(el: Element): boolean {
  return FORBIDDEN.test(elementLabel(el));
}

export function isConsequential(el: Element): boolean {
  return CONSEQUENTIAL.test(elementLabel(el));
}

/** The element that actually receives a click (labels and wrappers resolve to their control). */
export function clickTarget(el: Element): HTMLElement | null {
  if (el instanceof HTMLElement) return el;
  return null;
}

/**
 * React tracks input values itself; assigning `.value` directly is swallowed
 * by its value tracker, so the form state (and totals) never update. Use the
 * prototype setter, then fire the events React listens to.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function pickOption(select: HTMLSelectElement, wanted: string): HTMLOptionElement | null {
  const want = wanted.trim().toLowerCase();
  const options = Array.from(select.options).filter((o) => !o.disabled);
  const text = (o: HTMLOptionElement) => o.text.trim().toLowerCase();
  return (
    options.find((o) => text(o) === want || o.value.toLowerCase() === want) ??
    options.find((o) => text(o).startsWith(want)) ??
    options.find((o) => text(o).includes(want)) ??
    null
  );
}

/** Returns a short description of what was written, or null if it couldn't be. */
export function fillElement(el: Element, value: string, replace = true): string | null {
  if (el instanceof HTMLSelectElement) {
    if (el.disabled) return null;
    const option = pickOption(el, value);
    if (!option) return null;
    setNativeValue(el, option.value);
    return option.text.trim();
  }
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    const want = /^(true|yes|on|checked|1)$/i.test(value.trim());
    if (el.checked !== want) el.click();
    return want ? "checked" : "unchecked";
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.disabled || el.readOnly) return null;
    let text = value;
    if (el instanceof HTMLInputElement && el.type === "number") {
      // "100 dollars" / "$1,250.50" -> "100" / "1250.50"; a number input
      // silently empties itself on anything non-numeric.
      const n = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
      if (!n) return null;
      text = n[0];
    }
    const next = replace ? text : `${el.value}${text}`;
    el.focus();
    setNativeValue(el, next);
    return next;
  }
  return null;
}

/** What the page shows now for a field (selected option text for dropdowns). */
export function currentValue(el: Element): string | undefined {
  if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.text.trim();
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    return el.checked ? "checked" : "unchecked";
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return undefined;
}

/** After a click: where we are, what the page is warning about, what's still invalid. */
export function pageFeedback(clicked: Element) {
  const outsideDock = (n: Element) => !n.closest("[data-vita-dock]");
  const alerts = Array.from(document.querySelectorAll("[role=alert]"))
    .filter(outsideDock)
    .map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
  const form = clicked.closest("form");
  const invalid = form
    ? Array.from(form.querySelectorAll(":invalid"))
        .filter((n) => n instanceof HTMLElement && n.offsetParent !== null)
        .map((n) => elementLabel(n))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  return { url: `${window.location.pathname}${window.location.search}`, alerts, invalid };
}

export function highlightElement(el: Element) {
  if (!(el instanceof HTMLElement)) return;
  const previous = el.style.outline;
  const previousOffset = el.style.outlineOffset;
  el.style.outline = "3px solid var(--primary)";
  el.style.outlineOffset = "2px";
  setTimeout(() => {
    el.style.outline = previous;
    el.style.outlineOffset = previousOffset;
  }, 1600);
}

export function selectElementText(el: Element, start?: number | null, end?: number | null) {
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && start != null && end != null) {
    el.focus();
    el.setSelectionRange(start, end);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll into view and resolve once it's (roughly) settled. */
export async function bringIntoView(el: Element) {
  const rect = el.getBoundingClientRect();
  const visible = rect.top >= 60 && rect.bottom <= window.innerHeight - 60;
  if (visible) return;
  el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  await new Promise((r) => setTimeout(r, prefersReducedMotion() ? 0 : 350));
}

import "server-only";
import type { ExtractedReceiptData } from "@/lib/ocr";
import { renderPdfPagesToPng } from "@/lib/pdf-to-images";

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_VLM_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
// NVIDIA's shared endpoints return 503 "ResourceExhausted" / 429 when busy.
// Retry the primary briefly, then try a lighter model before giving up.
const DEFAULT_FALLBACK_VLM_MODEL = "meta/llama-3.2-11b-vision-instruct";
const RETRY_DELAYS_MS = [1500, 4000];
// The reasoning VLM takes ~30s on a receipt; leave headroom before giving up.
const TIMEOUT_MS = 90_000;

const PROMPT = `Analyze this receipt/invoice document and extract the financial data into JSON format.
Return ONLY valid JSON matching this schema:
{
  "vendorName": string or null,
  "date": "YYYY-MM-DD" or null,
  "totalAmount": number or null,
  "taxAmount": number or null,
  "categorySuggestion": string (e.g., "Office Supplies", "Meals & Entertainment", "Software & Subscriptions", "Travel", "Utilities"),
  "lineItems": [{"description": string, "amount": number}],
  "confidenceScore": number between 0.50 and 0.99
}`;

type ParsedReceipt = {
  vendorName?: unknown;
  date?: unknown;
  totalAmount?: unknown;
  taxAmount?: unknown;
  categorySuggestion?: unknown;
  lineItems?: unknown;
  confidenceScore?: unknown;
};

// VLMs sometimes return money as "$1,234.50" despite the schema asking for a number.
function toAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    if (value.trim() !== "" && Number.isFinite(n)) return n;
  }
  return null;
}

// Some models answer "09/14/2026" despite the YYYY-MM-DD instruction.
function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const us = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return null;
}

function toLineItems(value: unknown): ExtractedReceiptData["lineItems"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { description?: unknown; amount?: unknown } => typeof item === "object" && item !== null)
    .map((item) => ({
      description: typeof item.description === "string" ? item.description : "Item",
      amount: toAmount(item.amount) ?? 0,
    }));
}

/**
 * Same contract as the Claude path in ocr.ts, via an OpenAI-compatible NVIDIA
 * NIM vision model. The NIM chat API takes images but not PDFs, so PDFs are
 * rendered to page images first. Returns null on any failure.
 */
export async function extractReceiptDataWithNvidia(
  fileBuffer: Buffer,
  mimeType: string,
  apiKey: string,
): Promise<ExtractedReceiptData | null> {
  let images: Array<{ mimeType: string; data: Buffer }>;
  if (mimeType === "application/pdf") {
    const pages = await renderPdfPagesToPng(fileBuffer);
    images = pages.map((data) => ({ mimeType: "image/png", data }));
  } else if (mimeType.startsWith("image/")) {
    images = [{ mimeType, data: fileBuffer }];
  } else {
    images = [];
  }
  if (images.length === 0) {
    return null;
  }

  const prompt =
    images.length > 1
      ? `The ${images.length} images are consecutive pages of one document; totals are often on the last page.
${PROMPT}`
      : PROMPT;

  const content = [
    { type: "text", text: prompt },
    ...images.map((image) => ({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.data.toString("base64")}` },
    })),
  ];
  const models = [
    process.env.NVIDIA_VLM_MODEL || DEFAULT_VLM_MODEL,
    process.env.NVIDIA_VLM_FALLBACK_MODEL || DEFAULT_FALLBACK_VLM_MODEL,
  ];

  try {
    let text: unknown = null;
    for (const model of models) {
      text = await requestWithRetry(model, content, apiKey);
      if (typeof text === "string") break;
    }
    const jsonMatch = typeof text === "string" ? text.match(/\{[\s\S]*\}/) : null;
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as ParsedReceipt;
    return {
      vendorName: typeof parsed.vendorName === "string" ? parsed.vendorName : "Unknown Vendor",
      date: toIsoDate(parsed.date) ?? new Date().toISOString().slice(0, 10),
      totalAmount: toAmount(parsed.totalAmount) ?? 0,
      taxAmount: toAmount(parsed.taxAmount) ?? 0,
      categorySuggestion:
        typeof parsed.categorySuggestion === "string" ? parsed.categorySuggestion : "Office Supplies",
      lineItems: toLineItems(parsed.lineItems),
      confidenceScore: toAmount(parsed.confidenceScore) ?? 0.88,
    };
  } catch (err) {
    console.warn("NVIDIA vision extraction error, falling back to heuristic parser:", err);
    return null;
  }
}

/** One model, retried on "busy" responses. Returns the reply text, or null. */
async function requestWithRetry(model: string, content: unknown[], apiKey: string): Promise<string | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const response = await fetch(NVIDIA_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.1,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) {
      const data = await response.json();
      const text: unknown = data.choices?.[0]?.message?.content;
      return typeof text === "string" ? text : null;
    }

    const busy = response.status === 429 || response.status === 503;
    console.warn(`NVIDIA vision extraction failed (${model}):`, response.status, await response.text());
    if (!busy || attempt === RETRY_DELAYS_MS.length) return null;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
  return null;
}

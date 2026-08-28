"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateInvoiceState = { error: string | null };

type InvoiceLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

/**
 * Creates a draft invoice + its lines. Posting to the GL happens separately,
 * on send (see issueInvoiceAction) — invoices start 'draft' per project.md's
 * schema, unlike bills which post immediately.
 */
export async function createInvoiceAction(
  tenantId: string,
  _prevState: CreateInvoiceState,
  formData: FormData,
): Promise<CreateInvoiceState> {
  const contactId = String(formData.get("contactId") ?? "");
  const issueDate = String(formData.get("issueDate") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const linesJson = String(formData.get("lines") ?? "[]");

  if (!contactId) {
    return { error: "Select a customer." };
  }

  let rawLines: InvoiceLineInput[];
  try {
    rawLines = JSON.parse(linesJson);
  } catch {
    return { error: "Malformed line data." };
  }

  const lines = rawLines.filter((l) => l.description && l.quantity > 0 && l.unitPrice >= 0);
  if (lines.length === 0) {
    return { error: "Add at least one line item." };
  }

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const taxTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice * l.taxRate, 0);
  const total = subtotal + taxTotal;

  const supabase = await createClient();

  const { data: invoiceNumber, error: numberError } = await supabase.rpc(
    "next_invoice_number",
    { p_tenant_id: tenantId },
  );
  if (numberError) {
    return { error: numberError.message };
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      contact_id: contactId,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate,
      subtotal: round2(subtotal),
      tax_total: round2(taxTotal),
      total: round2(total),
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { error: invoiceError?.message ?? "Could not create invoice." };
  }

  const { error: linesError } = await supabase.from("invoice_lines").insert(
    lines.map((l, i) => ({
      invoice_id: invoice.id,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      tax_rate: l.taxRate,
      amount: round2(l.quantity * l.unitPrice),
      sort_order: i,
    })),
  );

  if (linesError) {
    return { error: linesError.message };
  }

  revalidatePath("/sales");
  redirect(`/sales/${invoice.id}`);
}

export async function issueInvoiceAction(invoiceId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_invoice_issued", { p_invoice_id: invoiceId });
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/sales");
  revalidatePath(`/sales/${invoiceId}`);
  revalidatePath("/dashboard");
}

export type RecordPaymentState = { error: string | null };

export async function recordInvoicePaymentAction(
  tenantId: string,
  contactId: string,
  invoiceId: string,
  _prevState: RecordPaymentState,
  formData: FormData,
): Promise<RecordPaymentState> {
  const paymentDate = String(formData.get("paymentDate") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const method = String(formData.get("method") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  if (!(amount > 0)) {
    return { error: "Enter a payment amount greater than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_payment_received", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_payment_date: paymentDate,
    p_amount: amount,
    // the generated RPC arg types are non-nullable `string`, but the underlying
    // Postgres params are nullable `text` — same gap as post_manual_journal_entry.
    p_method: (method || null) as string,
    p_reference: (reference || null) as string,
    p_stripe_payment_intent_id: null as unknown as string,
    p_applications: [{ invoiceId, amount }],
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${invoiceId}`);
  revalidatePath("/dashboard");
  redirect(`/sales/${invoiceId}`);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

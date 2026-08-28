import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * On checkout.session.completed, records the payment against the invoice via
 * the same post_payment_received RPC the manual "record payment" form uses —
 * one posting path, one GL invariant, regardless of how the money arrived.
 * Called with the service-role client since there's no user session here;
 * post_payment_received's own auth.role() = 'service_role' check is what
 * allows this (see the ar_posting_functions migration).
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature.";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoiceId;
    const tenantId = session.metadata?.tenantId;
    const contactId = session.metadata?.contactId;
    const amountTotal = session.amount_total;

    if (!invoiceId || !tenantId || !contactId || amountTotal == null) {
      // Not one of our invoice checkout sessions (or malformed metadata) — ignore.
      return NextResponse.json({ received: true });
    }

    const admin = createAdminClient();
    const { error } = await admin.rpc("post_payment_received", {
      p_tenant_id: tenantId,
      p_contact_id: contactId,
      p_payment_date: new Date().toISOString().slice(0, 10),
      p_amount: amountTotal / 100,
      p_method: "stripe",
      p_reference: session.id,
      // the generated RPC arg type is non-nullable `string`, but the underlying
      // Postgres param is a nullable `text` — same gap as post_manual_journal_entry.
      p_stripe_payment_intent_id: (typeof session.payment_intent === "string"
        ? session.payment_intent
        : null) as string,
      p_applications: [{ invoiceId, amount: amountTotal / 100 }],
    });

    if (error) {
      // Returning 500 tells Stripe to retry the webhook — safe here since
      // post_payment_received's application logic isn't idempotent-guarded
      // per Stripe event id, so a genuine transient failure (not a duplicate
      // delivery) is the case worth retrying. Duplicate deliveries of an
      // already-applied session would instead fail the overpayment guard,
      // which is also a real error worth surfacing rather than silently
      // swallowing.
      console.error("Stripe webhook: post_payment_received failed", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

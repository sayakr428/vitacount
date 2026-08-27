"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createInvoiceCheckoutSessionAction } from "@/lib/actions/stripe-checkout";

export function CreateStripeLinkButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-fit rounded-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createInvoiceCheckoutSessionAction(invoiceId);
            if (result.error) {
              setError(result.error);
              return;
            }
            if (result.url) {
              window.location.href = result.url;
            }
          })
        }
      >
        {pending ? "Creating payment link…" : "Pay with card (Stripe)"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

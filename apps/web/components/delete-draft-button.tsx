"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteDraftInvoiceAction } from "@/lib/actions/invoices";

export function DeleteDraftButton({ invoiceId, label = "invoice" }: { invoiceId: string; label?: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" className="rounded-full text-destructive" onClick={() => setConfirming(true)}>
        Delete draft
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Delete this draft {label}?</span>
        <Button type="button" variant="ghost" className="rounded-full" disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="rounded-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await deleteDraftInvoiceAction(invoiceId);
              if (result.error) {
                setError(result.error);
                return;
              }
              router.push("/sales");
            })
          }
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

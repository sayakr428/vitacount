"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { issueInvoiceAction } from "@/lib/actions/invoices";

export function IssueInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      className="rounded-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await issueInvoiceAction(invoiceId);
          router.refresh();
        })
      }
    >
      {pending ? "Sending…" : "Send invoice"}
    </Button>
  );
}

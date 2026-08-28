"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createContactAction, type CreateContactState } from "@/lib/actions/contacts";

const initialState: CreateContactState = { error: null };

export function NewContactForm({ tenantId }: { tenantId: string }) {
  const [state, formAction, pending] = useActionState(
    createContactAction.bind(null, tenantId),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Name</Label>
        <Input id="displayName" name="displayName" required className="w-56" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="type">Type</Label>
        <select
          id="type"
          name="type"
          required
          defaultValue="customer"
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="customer">Customer</option>
          <option value="vendor">Vendor</option>
          <option value="both">Both</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" className="w-56" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" className="w-40" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="paymentTerms">Payment terms</Label>
        <select
          id="paymentTerms"
          name="paymentTerms"
          defaultValue="net_30"
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="due_on_receipt">Due on receipt</option>
          <option value="net_15">Net 15</option>
          <option value="net_30">Net 30</option>
          <option value="net_60">Net 60</option>
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
        <input type="checkbox" name="is1099Vendor" className="size-4 rounded border-border" />
        1099 vendor
      </label>
      <Button type="submit" disabled={pending} className="rounded-full">
        {pending ? "Adding…" : "Add contact"}
      </Button>
      {state.error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

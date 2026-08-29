"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createTenantAction, type CreateTenantState } from "@/lib/tenant/actions";

const initialState: CreateTenantState = { error: null };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createTenantAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Name your workspace</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          This is your business — you can invite teammates once it&apos;s
          created.
        </p>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Business name</Label>
            <Input id="name" name="name" type="text" required autoFocus />
          </div>
          {state.error ? (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

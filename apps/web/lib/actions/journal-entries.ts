"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { postManualEntry, type JournalLineInput } from "@vitacount/posting-engine";
import { createClient } from "@/lib/supabase/server";

export type CreateJournalEntryState = { error: string | null };

export async function createJournalEntryAction(
  tenantId: string,
  _prevState: CreateJournalEntryState,
  formData: FormData,
): Promise<CreateJournalEntryState> {
  const entryDate = String(formData.get("entryDate") ?? "");
  const memo = String(formData.get("memo") ?? "");
  const linesJson = String(formData.get("lines") ?? "[]");

  let rawLines: JournalLineInput[];
  try {
    rawLines = JSON.parse(linesJson);
  } catch {
    return { error: "Malformed line data." };
  }

  const lines = rawLines
    .filter((l) => l.accountId)
    .map((l) => ({
      accountId: l.accountId,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      memo: l.memo || undefined,
    }));

  let validated;
  try {
    validated = postManualEntry({
      tenantId,
      entryDate,
      memo,
      sourceType: "manual",
      lines,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid entry." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_manual_journal_entry", {
    p_tenant_id: tenantId,
    p_entry_date: validated.entryDate,
    // the generated RPC arg type is `string`, but the underlying Postgres
    // param is a nullable `text` — the type generator doesn't expose that.
    p_memo: (validated.memo ?? null) as string,
    p_lines: validated.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      memo: l.memo ?? null,
    })),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/cpa/journal-entries");
  redirect("/cpa/journal-entries");
}

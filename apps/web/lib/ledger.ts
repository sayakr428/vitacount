import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface LedgerLine {
  entryDate: string;
  accountId: string;
  debit: number;
  credit: number;
}

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
}

const PAGE_SIZE = 1000;
const PARALLEL_PAGES = 4;

export async function fetchAccountIndex(supabase: Supabase, tenantId: string): Promise<Map<string, LedgerAccount>> {
  const { data, error } = await supabase.from("accounts").select("id, code, name, type").eq("tenant_id", tenantId);
  if (error) throw error;
  return new Map((data ?? []).map((a) => [a.id, a as LedgerAccount]));
}

/**
 * Every posted journal line for one tenant with entry_date in [from, to].
 *
 * Two traps this avoids, both of which silently produced wrong totals before:
 * - The date/tenant filters go through `journal_entries!inner`. Without `!inner`,
 *   PostgREST applies a filter on an embedded table to the embed only — it still
 *   returns every line (all dates, every workspace the user belongs to) with the
 *   embed nulled out.
 * - Results are paged: PostgREST caps a response at max-rows (1000 on Supabase),
 *   which would quietly truncate a year of activity.
 */
export async function fetchLedgerLines(supabase: Supabase, tenantId: string, from: string, to: string): Promise<LedgerLine[]> {
  if (from > to) return [];

  const page = (offset: number, limit: number, withCount: boolean) =>
    supabase
      .from("journal_entry_lines")
      .select("id, account_id, debit, credit, journal_entry:journal_entries!inner(entry_date)", withCount ? { count: "exact" } : undefined)
      .eq("journal_entry.tenant_id", tenantId)
      .eq("journal_entry.status", "posted")
      .gte("journal_entry.entry_date", from)
      .lte("journal_entry.entry_date", to)
      .order("id")
      .range(offset, offset + limit - 1);

  const first = await page(0, PAGE_SIZE, true);
  if (first.error) throw first.error;

  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  // If the server caps pages below PAGE_SIZE, keep stepping by what it actually returns.
  const step = rows.length > 0 ? rows.length : PAGE_SIZE;

  const offsets: number[] = [];
  for (let offset = rows.length; offset < total; offset += step) offsets.push(offset);

  for (let i = 0; i < offsets.length; i += PARALLEL_PAGES) {
    const batch = await Promise.all(offsets.slice(i, i + PARALLEL_PAGES).map((offset) => page(offset, step, false)));
    for (const result of batch) {
      if (result.error) throw result.error;
      rows.push(...(result.data ?? []));
    }
  }

  return rows.map((row) => ({
    entryDate: row.journal_entry.entry_date,
    accountId: row.account_id,
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
  }));
}

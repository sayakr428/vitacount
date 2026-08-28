import { assertBalanced } from "./validate";
import type { PostableJournalEntry } from "./types";

/**
 * Validates a manual journal entry balances before it's ever sent to the
 * database. The Postgres deferred constraint trigger is the real invariant —
 * this is the fast, framework-agnostic fail-fast check every posting
 * function in this package shares.
 */
export function postManualEntry(entry: PostableJournalEntry): PostableJournalEntry {
  assertBalanced(entry.lines);
  return entry;
}

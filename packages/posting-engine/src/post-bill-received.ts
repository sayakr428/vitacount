import { assertBalanced } from "./validate";
import type { JournalLineInput } from "./types";

export type BillLineForPosting = {
  accountId: string; // the expense/COGS category chosen for this line
  amount: number;
};

export type BillAccountIds = {
  accountsPayableId: string;
};

/**
 * Client-side preview/validation mirroring create_bill_received: debit each
 * line's chosen expense/COGS account for its amount, credit AP for the total.
 */
export function postBillReceived(
  lines: BillLineForPosting[],
  accountIds: BillAccountIds,
): JournalLineInput[] {
  if (lines.length === 0) {
    throw new Error("A bill needs at least one line.");
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  const journalLines: JournalLineInput[] = [
    ...lines.map((l) => ({ accountId: l.accountId, debit: l.amount })),
    { accountId: accountIds.accountsPayableId, credit: total },
  ];

  assertBalanced(journalLines);
  return journalLines;
}

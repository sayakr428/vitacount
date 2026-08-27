import { assertBalanced } from "./validate";
import type { JournalLineInput } from "./types";

export type PaymentAccountIds = {
  cashId: string;
  accountsReceivableId: string;
};

/**
 * Client-side preview/validation mirroring post_payment_received: debit Cash,
 * credit AR, for the payment's total amount (the sub-ledger detail of which
 * invoice(s) it's applied to lives in payment_applications, not as separate
 * GL lines — AR is a single control account).
 */
export function postPaymentReceived(
  amount: number,
  accountIds: PaymentAccountIds,
): JournalLineInput[] {
  const lines: JournalLineInput[] = [
    { accountId: accountIds.cashId, debit: amount },
    { accountId: accountIds.accountsReceivableId, credit: amount },
  ];

  assertBalanced(lines);
  return lines;
}

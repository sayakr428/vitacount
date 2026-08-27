import { assertBalanced } from "./validate";
import type { JournalLineInput } from "./types";

export type VendorPaymentAccountIds = {
  accountsPayableId: string;
  cashId: string;
};

/**
 * Client-side preview/validation mirroring post_vendor_payment_made's immediate
 * (non-scheduled) path: debit AP, credit Cash.
 */
export function postVendorPaymentMade(
  amount: number,
  accountIds: VendorPaymentAccountIds,
): JournalLineInput[] {
  const lines: JournalLineInput[] = [
    { accountId: accountIds.accountsPayableId, debit: amount },
    { accountId: accountIds.cashId, credit: amount },
  ];

  assertBalanced(lines);
  return lines;
}

import { assertBalanced } from "./validate";
import type { JournalLineInput } from "./types";

export type InvoiceForPosting = {
  subtotal: number;
  taxTotal: number;
  total: number;
};

export type InvoiceAccountIds = {
  accountsReceivableId: string;
  revenueId: string;
  taxPayableId?: string;
};

/**
 * Client-side preview/validation for what post_invoice_issued (the SQL RPC that
 * does the real, authoritative posting) is about to write: debit AR for the
 * invoice total, credit Revenue for the subtotal, credit Sales Tax Payable for
 * the tax portion if any. Lets the invoice form show "this will balance" before
 * the user submits, without duplicating the Postgres function as the source of
 * truth — the RPC re-derives and re-validates everything server-side regardless.
 */
export function postInvoiceIssued(
  invoice: InvoiceForPosting,
  accountIds: InvoiceAccountIds,
): JournalLineInput[] {
  const lines: JournalLineInput[] = [
    { accountId: accountIds.accountsReceivableId, debit: invoice.total },
    { accountId: accountIds.revenueId, credit: invoice.subtotal },
  ];

  if (invoice.taxTotal > 0) {
    if (!accountIds.taxPayableId) {
      throw new Error("Invoice has sales tax but no Sales Tax Payable account was provided.");
    }
    lines.push({ accountId: accountIds.taxPayableId, credit: invoice.taxTotal });
  }

  assertBalanced(lines);
  return lines;
}

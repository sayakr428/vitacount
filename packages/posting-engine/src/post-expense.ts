import { STANDARD_ACCOUNT_CODES } from "./account-codes";
import { PostableJournalEntry } from "./types";
import { assertBalanced } from "./validate";

export interface ExpenseInput {
  tenantId: string;
  expenseDate: string;
  amount: number;
  expenseAccountId: string;
  cashAccountId?: string;
  memo?: string;
}

export function postExpense(input: ExpenseInput): PostableJournalEntry {
  if (input.amount <= 0) {
    throw new Error("Expense amount must be greater than zero");
  }

  const lines = [
    {
      accountId: input.expenseAccountId,
      debit: Number(input.amount.toFixed(2)),
      credit: 0,
      memo: input.memo || "Expense item",
    },
    {
      accountId: input.cashAccountId || STANDARD_ACCOUNT_CODES.cash,
      debit: 0,
      credit: Number(input.amount.toFixed(2)),
      memo: "Cash outflow",
    },
  ];

  const entry: PostableJournalEntry = {
    tenantId: input.tenantId,
    entryDate: input.expenseDate,
    memo: input.memo || "Expense payment",
    sourceType: "expense",
    lines,
  };

  assertBalanced(lines);
  return entry;
}

import type { JournalLineInput } from "./types";

export class UnbalancedEntryError extends Error {
  constructor(
    public readonly totalDebit: number,
    public readonly totalCredit: number,
  ) {
    super(
      `Journal entry is unbalanced: debit ${totalDebit.toFixed(2)} != credit ${totalCredit.toFixed(2)}`,
    );
    this.name = "UnbalancedEntryError";
  }
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function assertBalanced(lines: JournalLineInput[]): void {
  if (lines.length < 2) {
    throw new Error("A journal entry needs at least two lines.");
  }

  for (const line of lines) {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;

    if (debit < 0 || credit < 0) {
      throw new Error("Debit and credit amounts cannot be negative.");
    }
    if (debit > 0 && credit > 0) {
      throw new Error(
        "A single journal entry line cannot carry both a debit and a credit.",
      );
    }
    if (debit === 0 && credit === 0) {
      throw new Error("Every journal entry line must have a nonzero amount.");
    }
  }

  const totalDebit = round(lines.reduce((sum, l) => sum + (l.debit ?? 0), 0));
  const totalCredit = round(
    lines.reduce((sum, l) => sum + (l.credit ?? 0), 0),
  );

  if (totalDebit !== totalCredit) {
    throw new UnbalancedEntryError(totalDebit, totalCredit);
  }
}

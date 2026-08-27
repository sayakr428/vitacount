export type JournalLineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string;
};

export type PostableJournalEntry = {
  tenantId: string;
  entryDate: string;
  memo?: string;
  sourceType: string;
  sourceId?: string;
  lines: JournalLineInput[];
};

/**
 * Fixed codes from the default seeded Chart of Accounts (see the
 * financial_core_default_coa migration). The AR/AP posting functions look
 * accounts up by these codes rather than by name, since codes are the stable
 * identifier — display names could theoretically be renamed by a tenant later.
 */
export const STANDARD_ACCOUNT_CODES = {
  cash: "1000",
  accountsReceivable: "1010",
  accountsPayable: "2000",
  salesTaxPayable: "2010",
  salesRevenue: "4000",
} as const;

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: string;
}

export function getPlaidConfig(): PlaidConfig | null {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";

  if (!clientId || !secret) {
    return null;
  }

  return { clientId, secret, env };
}

/**
 * Creates sandbox demo transactions for testing reconciliation matching.
 */
export function generateDemoBankTransactions(accountName: string) {
  const today = new Date();
  
  const formatDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(today.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  return [
    {
      plaid_transaction_id: `plaid_tx_${Date.now()}_1`,
      posted_date: formatDate(1),
      amount: 1500.00, // Positive = Money In / Customer Payment
      description: "INCOMING WIRE: Acme Client Invoice Payment",
    },
    {
      plaid_transaction_id: `plaid_tx_${Date.now()}_2`,
      posted_date: formatDate(2),
      amount: -450.00, // Negative = Money Out / Vendor Bill Payment
      description: "ACH DEBIT: Global Tech Supplies Bill",
    },
    {
      plaid_transaction_id: `plaid_tx_${Date.now()}_3`,
      posted_date: formatDate(3),
      amount: -34.20,
      description: "DEBIT CARD: Uber Trip Office Travel",
    },
    {
      plaid_transaction_id: `plaid_tx_${Date.now()}_4`,
      posted_date: formatDate(4),
      amount: -289.00,
      description: "CARD PURCHASE: Amazon Web Services Cloud",
    },
    {
      plaid_transaction_id: `plaid_tx_${Date.now()}_5`,
      posted_date: formatDate(5),
      amount: 850.00,
      description: "STRIPE DEPOSIT: Customer Invoice #1002",
    },
  ];
}

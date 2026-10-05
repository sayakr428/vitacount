"""What Vita knows about VitaCount's pages, so it can explain and navigate.

Keep in sync with apps/web/app/(app)/. ``navigate`` only accepts these paths
(plus the documented ``?type=`` variants), so the model can't send the user
somewhere arbitrary.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Page:
    path: str
    title: str
    description: str


PAGES: tuple[Page, ...] = (
    Page(
        "/dashboard",
        "Dashboard",
        "Home. Money in, money out, net cash flow, bank balances, overdue alerts, "
        "income vs expense trend. Has a date-range filter.",
    ),
    Page(
        "/transactions",
        "Transactions",
        "One feed of everything that moved money: invoices, payments, bills, expenses.",
    ),
    Page(
        "/sales",
        "Sales",
        "Invoices, sales receipts, refunds, debit notes, what customers owe, and the "
        "collections agent's reminders.",
    ),
    Page(
        "/sales/new?type=invoice",
        "New invoice",
        "Create an invoice: customer, line items, tax percent, terms or due date. Saves "
        "as a draft; issuing it is a separate step.",
    ),
    Page(
        "/sales/new?type=sales_receipt",
        "New sales receipt",
        "Record a sale that was paid on the spot. Posts immediately.",
    ),
    Page("/sales/new?type=refund_receipt", "New refund receipt", "Refund a customer."),
    Page("/sales/new?type=debit_note", "New debit note", "Charge a customer an extra amount."),
    Page(
        "/sales/receive-payment",
        "Receive payment",
        "Record a customer payment. A lump sum is applied to their oldest open invoices "
        "first; any overpayment becomes customer credit.",
    ),
    Page("/expenses", "Expenses", "Bills, expenses and supplier credits; what you owe vendors."),
    Page("/expenses/new?type=bill", "New bill", "Enter a vendor bill to pay later."),
    Page("/expenses/new?type=expense", "New expense", "Record something already paid."),
    Page(
        "/expenses/new?type=vendor_credit",
        "New supplier credit",
        "Record a credit a vendor gave you.",
    ),
    Page("/expenses/pay-bills", "Pay bills", "Choose open bills for a vendor and pay them."),
    Page("/banking", "Banking", "Bank accounts and bank feeds; sync transactions."),
    Page(
        "/reconciliation",
        "Reconciliation",
        "Match bank transactions to invoices, bills and expenses. Shows auto-matched items "
        "and a Needs Review queue to approve or reject.",
    ),
    Page(
        "/documents",
        "Documents",
        "Upload receipts and bills (images or PDFs). The AP agent reads them; extracted ones "
        "wait for review and verify-and-post.",
    ),
    Page("/reports", "Reports", "Profit and loss, balance sheet, receivables and payables aging."),
    Page("/contacts", "Contacts", "Customers and vendors."),
    Page(
        "/agents",
        "AI agents",
        "Control panel for the AI agents: autonomy level per agent, the emergency kill switch, "
        "and the activity log of everything agents did.",
    ),
    Page("/cpa/accounts", "Chart of accounts", "CPA mode: the general ledger accounts."),
    Page("/cpa/journal-entries", "Journal entries", "CPA mode: posted journal entries."),
    Page("/cpa/journal-entries/new", "New journal entry", "CPA mode: write a manual entry."),
    Page("/settings/team", "Team", "Invite teammates and see roles (owners and admins only)."),
    Page("/projects", "Projects", "Coming soon."),
    Page("/inventory", "Inventory", "Coming soon."),
    Page("/forecasting", "Forecasting", "Coming soon."),
)

ALLOWED_PATHS = frozenset(p.path for p in PAGES)


def describe_app() -> str:
    return "\n".join(f"- {p.path} ({p.title}): {p.description}" for p in PAGES)


def title_for(path: str) -> str | None:
    """Best-effort page title for a pathname like /sales/3f2a… or /sales/new?type=bill."""
    if path in ALLOWED_PATHS:
        return next(p.title for p in PAGES if p.path == path)
    base = path.split("?", 1)[0]
    if base.startswith("/sales/") and base != "/sales/new":
        return "A sales document"
    if base.startswith("/expenses/") and base not in ("/expenses/new", "/expenses/pay-bills"):
        return "A purchase document"
    for p in PAGES:
        if p.path == base:
            return p.title
    return None

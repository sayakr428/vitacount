# VitaCount — Dashboard Screen Spec (every field, mapped to its data source)

Companion to `build-playbook.md` Session 8. This document itemizes **every visible element** in the reference dashboard mock and maps it to the exact table/query from `project.md` it should be built from — so nothing gets built with placeholder/fake data by accident.

## ⚠️ Scope decision needed first

Three widgets in the mock depend on modules `build-playbook.md` deferred past MVP: **Project Profitability** (needs Projects module), the **Low Inventory** exception alert and the Inventory nav item (needs Inventory module), and the **High Expense Detected** anomaly alert (needs the Anomaly Agent, also post-MVP). The **Cash Flow Forecast**'s dotted "Forecast" line also technically belongs to the Pro-tier scenario-simulation engine.

**Recommended approach (used throughout this doc):** build these as **real UI, locked/teaser state** — visible, on-brand, with an "Available on Growth/Pro" CTA — rather than either faking numbers or hiding them entirely. This is what makes the tier upsell real instead of theoretical. If you'd rather pull Projects/Inventory into MVP scope instead, tell me and I'll rewrite Sessions 7–8 of the playbook to insert them before the dashboard.

---

## Top navigation bar

| Element | Data source | MVP status |
|---|---|---|
| Logo + "VitaCount" | static | MVP |
| Global search bar | Postgres `ILIKE`/full-text search across `contacts`, `invoices`, `bills`, `bank_transactions` (name/number match). Semantic search is a later upgrade, not MVP | MVP (basic) |
| "+ New" button | dropdown → quick-create: Invoice, Bill, Expense, Payment, Contact — each opens the relevant Session 4/5/6 form | MVP |
| Gift icon | referral program | Defer — not in any tier doc, skip entirely for MVP |
| Checklist icon | onboarding task tracker (e.g. "connect a bank," "send first invoice," "invite a teammate") — genuinely useful for activation, worth building as a simple `onboarding_tasks` per-tenant checklist | MVP (lightweight) |
| Help icon | link to a docs/support page | MVP (static link is fine) |
| Notification bell | unread count from a `notifications` table — populate from `agent_actions` (new proposed actions), overdue invoices, failed bank sync | MVP |
| User menu (avatar, name, tenant name, dropdown) | `profiles.full_name` + `profiles.avatar_url` + current tenant name from `memberships`/`tenants`, dropdown includes tenant switcher (built in Session 2), logout | MVP |

## Left sidebar

| Nav item | Route/module | MVP status |
|---|---|---|
| Dashboard | this screen | MVP |
| Transactions | unified feed view (see "Recent Transactions" below — same underlying view, full page) | MVP |
| Sales | invoices list (Session 4) | MVP |
| Expenses | bills + expenses list (Session 5/6) | MVP |
| Banking | Reconciliation Center full page (Session 7/9) | MVP |
| Projects | — | **Locked nav item**, "Growth" badge, click → upgrade prompt |
| Inventory | — | **Locked nav item**, "Growth" badge, click → upgrade prompt |
| Reports | fixed-format reports (Session 8) | MVP |
| Forecasting | — | **Locked nav item**, "Pro" badge |
| Documents | receipt/document library (Session 6) | MVP |
| Reconciliation | badge = `count(reconciliation_matches where status in ('needs_review')) + count(bank_transactions where status='unmatched')` | MVP |
| Contacts | contacts list (Session 4) | MVP |
| Settings | tenant settings, users/roles, billing (Session 11) | MVP |

**Sidebar usage widget** ("VitaCount Growth · Usage this month," 78% bar, API Calls, Statement Lines): this exact widget only makes sense for a plan with metered caps. Since MVP is mostly Starter tier (unlimited, per the pricing doc), don't show a misleading progress bar implying a cap that doesn't exist. Build it as: plan name badge (e.g. "Starter Plan") + real usage numbers pulled from `usage_events` (Part 2.12) shown as counters, no percentage bar unless the tenant is on a tier with an actual cap. "View usage details" → the Session 11 billing page.

## Top module tab bar

| Tab | Maps to | MVP status |
|---|---|---|
| Dashboard | this screen | MVP |
| Money In (Income & AR) | Sales/AR summary view | MVP |
| Money Out (Expenses & AP) | Expenses/AP summary view | MVP |
| Net Cash Flow (Cash & Forecast) | Cash flow statement (real) + forecast line (see Cash Flow Forecast panel below) | MVP for actuals, locked for scenario forecast |
| Projects | — | Locked |
| Inventory | — | Locked |
| Reports | Session 8 reports | MVP |
| CPA Mode | trial balance / raw journal entries toggle (Session 3/8) | MVP |

## Greeting header

- `"Good morning, {profiles.full_name}"` — time-of-day-aware (morning/afternoon/evening based on tenant's local time).
- Subtext static copy.
- Date range selector: "Last 30 days" dropdown (options: 7/30/90 days, this month, last month, custom range) — drives every widget below it.
- "Customize" (drag-to-rearrange widgets): **defer to post-MVP** — ship a fixed, well-designed layout first; customizable dashboards are a nice-to-have, not a launch blocker.

## Bank Accounts panel

Source: `bank_accounts` (Session 7). Per row: institution name/logo initial, nickname, masked number (`•••• ` + last 4 of Plaid account mask), `account_type`, `current_balance` (render negative/credit-card balances in red), `"Updated {relative_time(last_synced_at)} ago"`. "Connect a bank" → Plaid Link flow.

## The 4 KPI cards (Total Income / Total Expenses / Net Profit / Net Cash Flow)

All four are **live queries over `journal_entry_lines` joined to `accounts`**, grouped by `accounts.type`, for the selected date range — never a cached/shadow number, per `project.md` Part 3's core rule.
- **Total Income** = sum of credits to revenue accounts in range.
- **Total Expenses** = sum of debits to expense accounts in range.
- **Net Profit** = Income − Expenses.
- **Net Cash Flow** = net movement across cash/bank accounts in range (from `journal_entry_lines` on asset accounts flagged as cash-equivalent, or directly from `bank_transactions` sum — pick one source of truth and document which in `CONTEXT_LOG.md`).
- **% change** = same metric over the immediately preceding period of equal length.
- **Sparkline** = daily rollup of the same metric across the range.

## Reconciliation Center panel

Donut + legend: `count(*) group by reconciliation_matches.status` (`auto_matched`, `needs_review`) plus `count(bank_transactions where status='unmatched')` for the "Unmatched" slice, plus an "Exceptions" bucket (Session 9's confidence < 0.70 flag). "X Total" = total bank transactions in the reconciliation window; "Y Accounts" = `count(distinct bank_account_id)`. This panel is just a summary card over data Sessions 7 and 9 already produce — no new backend logic needed at Session 8, just the card.

## Cash Flow Forecast panel

- **Actual (solid line)**: real daily cash position trend from `bank_accounts.current_balance` history / bank transaction rollups — genuinely buildable in MVP, no AI needed.
- **Forecast (dotted line)**: the full version (scenario simulator, AI-driven, confidence ranges) is `project.md`'s Forecasting Agent — **out of MVP**. Recommended MVP compromise: a simple trailing-30-day linear/moving-average projection (pure statistics, no LLM, ~20 lines of SQL/JS) so the chart isn't empty, clearly labeled as a basic projection rather than the full AI forecast. Upgrade to the real agent post-MVP without changing the UI.

## Project Profitability panel

**Locked/teaser card.** Show the panel shell (title, "View all" link disabled) with a grayed-out sample state and "Track profitability across every project — available on the Growth plan" + upgrade button. Do not populate with fabricated numbers.

## Exception Alerts panel

Only build alert types that have real data in MVP:
| Alert type | MVP status | Source |
|---|---|---|
| Overdue invoices | **MVP — real** | `select * from invoices where due_date < current_date and status not in ('paid','void')`, badge count + total `$` sum |
| High expense detected | **Locked** (needs the Anomaly Agent, post-MVP) | — |
| Low inventory | **Locked** (needs Inventory module, post-MVP) | — |

Build the panel's component to accept an array of alert objects so adding the two locked types later is a data change, not a redesign — but for MVP launch, show Overdue Invoices as a real alert and the other two as grayed-out "coming soon" rows rather than omitting them, so the panel doesn't look sparse.

## Top Expense Categories panel

Fully MVP. Donut: group `bill_lines`/`expenses` (or the underlying `journal_entry_lines` debited to expense accounts) by `accounts.name`/category for the selected range, sum amounts, show top 4 + "Other" bucket. Center label = total expenses for the period (same number as the KPI card, must match exactly).

## Recent Transactions panel

Build **one Postgres view** — a unified "ledger feed" — that unions: invoices (on issue), `payments_received`, bills (on issue), `payments_made`, `expenses`, ordered by date desc, each row carrying `{type, counterparty_name, amount (signed), date, icon_key}`. Use this same view for both this 4-row dashboard widget and the full `/transactions` page (sidebar nav item) — build it once in Session 8, don't duplicate the query.

## Bottom trust footer

Static marketing copy (Secure & Reliable / Smarter Automation / Real-time Insights / Expert Support) — no backend work. One flag: only ship the **"SOC 2 Type II compliance"** claim if that's actually true or actively in progress — that's a real compliance/legal claim, not just UI copy, and is worth a quick check with whoever owns compliance before launch.

---

## What to change in Session 8's prompt

Add this line to the Session 8 prompt in `build-playbook.md` before running it:

> Also read `dashboard-ui-spec.md` — it maps every widget in the reference dashboard to its exact data source and flags which ones (Project Profitability, Low Inventory alert, High Expense alert, the AI forecast line) should be built as locked/teaser upsell states rather than with real data, since those modules are out of MVP scope. Build every widget listed there, including the locked ones — a locked card is still a card, don't just omit it.

# VitaCount — Build Playbook: Zero → MVP with Claude Code

Companion to `project.md`. Where `project.md` is the *spec*, this is the *sequence* — one Claude Code session per row, in order, each with a copy-pasteable prompt.

---

## MVP Scope Boundary (read this before Session 1)

**MVP = Starter-tier feature completeness (`$14.99/mo` tier from `VitaCount_Plans.pdf`) + Reconciliation Agent + AI chat assistant.**

**In scope:** multi-tenant auth, GL/ledger core, contacts, invoicing + online payment collection, bills, automated bank feeds + auto-matching, AI expense categorization, receipt/document capture, 20+ standard reports, AI chat assistant, subscription billing for the 3 tiers.

**Explicitly OUT of scope for MVP** (these are `project.md` M4/M6/M8-second-half/M9 — build after real users validate the core):
- Projects / job costing / time entries
- FIFO inventory / purchase orders
- Forecasting / scenario simulator
- AR Collections Agent, Inventory Reorder Agent, Project Margin Agent, Anomaly Agent, Command Center orchestrator
- Public API, webhooks, MCP server
- Workflow automation/batching, custom report builder
- Mobile GPS mileage tracking (needs a mobile app — web MVP only)

Tell Claude Code this boundary explicitly in Session 1 and it'll stop itself from scope-creeping into Growth-tier features mid-build — this is the single biggest failure mode in long agentic builds.

---

## 0. One-time setup (before you open Claude Code, ~1–2 hrs)

**Accounts to create now:**
| Service | What you need from it |
|---|---|
| Supabase | New project → note project ref, anon key, service role key, DB password |
| GitHub | Empty repo, e.g. `vitacount` |
| Anthropic Console | API key for the *app's* Claude API calls (separate from your Claude Code login) |
| Stripe | Test-mode secret key + publishable key |
| Plaid | Sandbox `client_id` + `secret` |
| Vercel | Connect later at Session 12, no action needed yet |

**Local tooling:**
```bash
# Node 20+, pnpm, Supabase CLI, git, Claude Code — install whichever you're missing
npm install -g pnpm
brew install supabase/tap/supabase   # or npm install -g supabase
```

**Bootstrap the repo:**
```bash
mkdir vitacount && cd vitacount
git init
supabase login
supabase init
supabase link --project-ref <your-project-ref>
```

**Drop these two files in the repo root before Session 1:**
1. `project.md` — the full spec you already have.
2. `CONTEXT_LOG.md` — start it with just this:
```markdown
# VitaCount — Build Context Log
Running log of what's been built, key decisions, and what's next.
Every Claude Code session should read this + project.md first, and append an entry before ending.

## Log
(empty — Session 1 adds the first entry)
```

**`.env.local` template** (fill in as you collect keys above; never commit this file):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
```

**Working pattern for every session below:** open a **fresh Claude Code session per milestone** (don't run all 12 in one giant context — quality degrades and it starts forgetting earlier decisions). Start every session by telling it to read `project.md` and `CONTEXT_LOG.md` first. End every session by having it append to `CONTEXT_LOG.md` and commit. Run `supabase db reset` locally after any migration to catch errors before pushing to the hosted project.

---

## Session 1 — Repo Scaffold

**Goal:** working Next.js + Supabase local dev environment, empty but correctly wired.

```
Read project.md in full — it's the spec for the whole product we're building. Read CONTEXT_LOG.md too (it'll be nearly empty, that's fine).

Scaffold the initial repo per project.md Part 10's structure:
- apps/web: Next.js 15, App Router, TypeScript, Tailwind, shadcn/ui installed and configured
- supabase/migrations, supabase/functions, supabase/seed.sql (empty for now)
- packages/tool-registry, packages/posting-engine, packages/ui as empty pnpm workspace packages with correct package.json + tsconfig
- Root pnpm-workspace.yaml, root package.json with dev scripts
- .env.example matching the variables I'll list below (no real values)
- A basic README pointing to project.md as the source of truth

Env vars needed: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV.

Set up the Supabase client helpers (browser client + server client using @supabase/ssr) in apps/web/lib/supabase/.

Don't build any tables, auth flows, or business logic yet — this session is scaffolding only. When done, run through the dev server yourself to confirm it boots with no errors, then append a CONTEXT_LOG.md entry summarizing exactly what exists now, and tell me the commands to run locally.
```

**Verify:** `pnpm install && pnpm dev` boots cleanly, empty homepage loads, no console errors.

---

## Session 2 — Auth & Multi-Tenant Foundation

**Goal:** real signup/login, workspace creation, team invites, tenant switching. This is the "user login & everything" ask — fully covered here.

```
Read project.md and CONTEXT_LOG.md first.

Build the full multi-tenant auth foundation per project.md Part 2.1:

1. Migration: profiles, tenants, memberships tables exactly as specified, plus a Postgres trigger on auth.users insert that auto-creates a profiles row.
2. RLS: enable RLS on all three tables. Implement the current_tenant_ids() security-definer helper function described in Part 2.1 and use it in every policy rather than repeating subqueries. Write policies for select/insert/update/delete with the role restrictions shown (e.g. only owner/admin can manage memberships).
3. Auth flows (Supabase Auth, email/password to start, structure it so Google OAuth can be added later without rework):
   - Signup → email verification → onboarding step that creates their first tenant (prompt for business name) and a memberships row with role='owner'
   - Login, logout, password reset
   - Session handling via middleware.ts that protects all routes except /login, /signup, /reset-password
4. Team invites: an "invite teammate" flow — owner/admin enters an email + role, creates a memberships row with status='invited', sends an invite email (use Supabase's built-in invite or a simple magic-link email for now), invitee accepts and status flips to 'active'.
5. Tenant context: a React context/provider that holds the current tenant, a tenant switcher in the UI header for users who belong to multiple tenants, and make sure every subsequent data fetch is implicitly scoped to the active tenant.
6. Write a short RLS test: as two different seeded users in two different tenants, confirm user A cannot read tenant B's memberships row even via direct query.

When done, update CONTEXT_LOG.md with the schema state, the auth flow decisions made, and anything you deferred (e.g. OAuth). Tell me how to test the full signup → create workspace → invite teammate loop manually.
```

**Verify:**
- [ ] Can sign up, verify email, land in a new empty workspace
- [ ] Can invite a second user, they accept, both show up under the same tenant
- [ ] Confirm in Supabase Studio that RLS actually blocks cross-tenant reads (try querying as a different user's JWT)

---

## Session 3 — Financial Core (Ledger)

**Goal:** the double-entry GL exists and is provably correct, before anything is built on top of it.

```
Read project.md and CONTEXT_LOG.md first.

Build the financial core per project.md Part 2.2:

1. Migrations: accounts, dimension_types, dimension_values, periods, journal_entries, journal_entry_lines, journal_entry_line_dimensions — exact schema as specified.
2. The balanced-entry constraint trigger from Part 2.2 — implement it exactly, deferrable, so multi-line entries can be inserted in one transaction before the check fires.
3. RLS on all these tables per the tenant_isolation pattern from Part 2.1, with journal_entries insert restricted to owner/admin/accountant roles as noted in project.md.
4. A default US Chart of Accounts seed: on tenant creation (hook into the onboarding flow from Session 2), auto-insert a standard starter COA (Cash, Accounts Receivable, Accounts Payable, Sales Revenue, COGS, common expense categories, Owner's Equity, Retained Earnings) as journal_entries's referenced accounts rows for that tenant. Put this seed data in supabase/seed.sql and also as a function callable at tenant-creation time.
5. packages/posting-engine: pure TypeScript functions that take a business event shape and return balanced journal entry lines — start with just postManualEntry(lines[]) validated to balance before insert. We'll add invoice/bill/payment-specific posting functions in later sessions as those modules are built.
6. Minimal UI: a Chart of Accounts page (list, add account) and a manual Journal Entry form under a /cpa route (this is the first piece of CPA Mode from Part 4.2 — don't build the full Owner/CPA split yet, just this one page).
7. Write a test that attempts to insert an unbalanced journal entry and confirms the database trigger rejects it — this is the most important test in the whole project, make sure it actually fails correctly.

Update CONTEXT_LOG.md: schema state, confirm the balanced-entry trigger test passes, note the default COA structure chosen.
```

**Verify:**
- [ ] Manually posting an unbalanced entry via the UI/API is rejected by the database, not just the frontend
- [ ] New tenant automatically gets the seeded chart of accounts
- [ ] Can view a simple trial balance query (sum debits/credits per account) and it's zero net

---

## Session 4 — Contacts + Accounts Receivable

**Goal:** a business can bill a customer and get paid, fully ledger-backed.

```
Read project.md and CONTEXT_LOG.md first.

Build per project.md Part 2.3 and 2.4:

1. Migrations: contacts, invoices, invoice_lines, payments_received, payment_applications. RLS per the standard pattern.
2. Extend packages/posting-engine: postInvoiceIssued (debit AR, credit Revenue + Sales Tax Payable if applicable) and postPaymentReceived (debit Cash, credit AR, plus payment_applications rows). Every invoice status change and payment must go through these functions — never write journal_entry_lines directly from the UI layer.
3. Sales tax: integrate a placeholder tax-calculation function now (flat configurable rate per tenant is fine for MVP — note in CONTEXT_LOG.md that TaxJar/Avalara integration is deferred to post-MVP, this avoids a costly API integration before we have paying customers to justify it).
4. Stripe: set up Stripe Checkout (or Payment Links) so a customer can pay an invoice online — on webhook confirmation, call postPaymentReceived automatically. Store stripe_payment_intent_id on the payment row.
5. UI: contacts list/create/edit (filter by customer/vendor/both), invoice list, invoice create/edit form with line items, invoice detail/send view (generate a shareable payment link), "record manual payment" flow for non-Stripe payments (cash/check).
6. Test: create an invoice, mark it paid via a simulated Stripe webhook, confirm the resulting journal entries balance and the invoice's balance_due correctly hits zero.

Update CONTEXT_LOG.md with what's built, the tax-calc placeholder decision, and Stripe webhook setup notes (I'll need to configure the webhook URL in the Stripe dashboard — tell me exactly what to paste where).
```

**Verify:**
- [ ] Create a customer, create an invoice, send it, pay it via Stripe test card, see it flip to "paid" and post correct GL entries
- [ ] Record a manual cash payment against a different invoice and confirm it also posts correctly

---

## Session 5 — Accounts Payable

**Goal:** vendor bills and vendor payments, mirroring Session 4's pattern.

```
Read project.md and CONTEXT_LOG.md first.

Build per project.md Part 2.5:

1. Migrations: bills, bill_lines, payments_made, bill_payment_applications. RLS per standard pattern.
2. Extend posting-engine: postBillReceived (debit Expense/COGS category chosen per line, credit AP) and postVendorPaymentMade (debit AP, credit Cash).
3. UI: vendor bill list/create/edit, "schedule payment" (sets scheduled_for date, doesn't post until the scheduled date/manual trigger — this maps to the pricing doc's "schedule vendor bill payments" feature), record payment flow, vendor detail page showing running payable balance.
4. Track is_1099_vendor on relevant contacts (already in the contacts schema) — just make sure the UI exposes this flag and there's a simple "vendor payments this year" report we can extend into real 1099 reporting post-MVP.
5. Test: create a bill, record a partial payment, confirm balance_due updates correctly and both journal entries are correct and independently balanced.

Update CONTEXT_LOG.md.
```

**Verify:**
- [ ] Create a bill, make a partial payment, make a second payment that closes it, confirm status flips to 'paid' and GL is correct throughout

---

## Session 6 — Document / Receipt Capture (OCR)

**Goal:** upload a receipt photo/PDF → get a draft bill or expense, human verifies, it posts. This is explicitly a Starter-tier feature.

```
Read project.md and CONTEXT_LOG.md first.

Build per project.md Part 2.9 and Part 6.2's "AP Bookkeeping Agent" row (autonomy level L1 — draft only, human must verify before posting):

1. Migration: documents table, and an expenses table (tenant_id, contact_id nullable, date, amount, account_id category, project_id nullable [leave null/unused for MVP], receipt_document_id, status).
2. Storage: a Supabase Storage bucket for receipts/documents, tenant-scoped folder structure, signed upload from the client.
3. supabase/functions/process-document: an Edge Function that takes a document_id, fetches the file, sends it to Claude (vision) via a thin llm-gateway function (put this gateway in supabase/functions/llm-gateway so later sessions reuse it), asks for structured extraction (vendor, date, line items, tax, total, confidence per field), writes the result to documents.extracted_data and sets status='extracted'.
4. Async wiring per project.md Part 7: pgmq queue for document processing, pg_cron polling it every ~10s, Edge Function processes the batch. Set this up exactly as described, don't build a different async pattern.
5. UI: upload a receipt → shows "processing" → once extracted, shows a review screen (pre-filled draft bill or expense form from the extracted data, editable) → user clicks "verify & post" → this calls the Session 5 postBillReceived (or a new postExpense function for non-bill expenses) → status becomes 'posted'.
6. Log every extraction as an agent_actions row (per Part 2.11 / Part 6.1) with agent_name='ap_bookkeeping_agent', autonomy_level=1, status='proposed' until the human verifies, then 'approved'.

Update CONTEXT_LOG.md, including how to test the pgmq/pg_cron pipeline locally.
```

**Verify:**
- [ ] Upload a real receipt photo, confirm it gets extracted with reasonable accuracy, review/edit/post it, confirm it lands correctly in AP or expenses
- [ ] Check the `agent_actions` table has a row for this — this is your first real agentic-layer data, confirm the plumbing works before Session 9 builds more agents on top of it

---

## Session 7 — Banking + Rule-Based Reconciliation

**Goal:** connect a real bank account, pull transactions, match them — rules-based first (per project.md's own build-order guidance: manual/deterministic flow before the AI agent sits on top of it).

```
Read project.md and CONTEXT_LOG.md first.

Build per project.md Part 2.6 and Part 4.1 — but for THIS session, implement matching as deterministic rules only (exact amount + date window + exact/fuzzy payee string match). We'll upgrade this to the full confidence-scored Reconciliation Agent with embeddings in Session 9 — don't build the AI/embedding part yet.

1. Migrations: bank_accounts, bank_transactions, reconciliation_matches per Part 2.6.
2. Plaid Link integration: connect-a-bank flow (Plaid Link in sandbox mode), store bank_account rows, set up the Plaid webhook endpoint to receive new transactions and insert into bank_transactions.
3. Rule-based matcher (a Supabase Edge Function or Postgres function, your call on which is cleaner here): for each new unmatched bank_transaction, look for an open invoice payment or bill payment with exact amount match within a 5-day window; if found, create a reconciliation_matches row with status='needs_review' (not auto-approved yet — that threshold behavior comes with the real confidence scoring in Session 9).
4. UI: the Reconciliation Center screen matching the dashboard screenshot's layout — donut chart of matched/needs-review/exceptions, bank account list with balances, a matching workspace (bank transaction on one side, candidate matches on the other, approve/reject buttons). On approve, call the appropriate posting-engine function and mark the match 'approved'.

Update CONTEXT_LOG.md, and tell me exactly how to test this with Plaid's sandbox test bank ("Platypus Bank" or similar) since I won't have a real bank connected yet.
```

**Verify:**
- [ ] Connect a Plaid sandbox bank account, see transactions appear
- [ ] Confirm rule-based candidate matches show up correctly for an invoice payment you created in Session 4
- [ ] Approve a match, confirm it posts correctly and doesn't double-count against the ledger

---

## Session 8 — Dashboard + Core Reports

**Goal:** the actual product experience — Owner Mode dashboard matching your reference screenshot, plus the reports a real user needs day one.

```
Read project.md, CONTEXT_LOG.md, and dashboard-ui-spec.md first — the spec file maps every single widget in the reference dashboard to its exact data source, and flags which ones (Project Profitability, Low Inventory alert, High Expense alert, the AI forecast line) must be built as locked/teaser upsell states rather than with real data, since those modules are out of MVP scope. Build every widget it lists, including the locked ones — a locked card is still a card, don't just omit it.

Build per project.md Part 4.2 (Owner Mode) and Part 4.3 (reporting), and dashboard-ui-spec.md for the exact widget list:

1. Owner Mode dashboard at the app's main route: every panel listed in dashboard-ui-spec.md — top nav, sidebar (with the usage widget built as described, not a fake capped progress bar), module tab bar, greeting header with date range selector, bank accounts panel, the 4 KPI cards with sparklines, Reconciliation Center summary card, Cash Flow Forecast (actual line real, forecast line as the simple statistical projection described, not the full agent), Project Profitability (locked/teaser), Exception Alerts (Overdue Invoices real, other two locked/grayed), Top Expense Categories, Recent Transactions (built off one shared "ledger feed" view, reused by the full Transactions page too), and the trust footer. Every number must be computed live from journal_entry_lines/accounts per Part 3's rule — never a separately maintained summary table.
2. Reports: build P&L (income statement), Balance Sheet, Cash Flow Statement, AR Aging, AP Aging as real queries against the ledger — each should support a date range and be exportable to CSV/PDF. These don't need the full drag-and-drop report canvas from project.md yet (that's a later enhancement) — fixed-format reports are fine for MVP.
3. Basic CPA Mode toggle in the header (per Part 4.2): switches the same data into a trial balance view + raw journal entries list + period status, gated to accountant/admin/owner roles.

Update CONTEXT_LOG.md.
```

**Verify:**
- [ ] Dashboard numbers actually match what you'd hand-calculate from the journal entries you've posted through Sessions 4–7
- [ ] Every report ties back to the same ledger — no drift between dashboard cards and detailed reports

---

## Session 9 — Reconciliation Agent (Agentic Layer v1)

**Goal:** upgrade Session 7's rule-based matcher into the real confidence-scored agent — the first genuinely agentic module, per project.md Part 6.

```
Read project.md and CONTEXT_LOG.md first.

Build per project.md Part 6.1 (framework) and the Reconciliation Agent row in Part 6.2:

1. Migration: agent_actions and transaction_embeddings tables (pgvector extension, HNSW index) per Part 2.11.
2. Extend the llm-gateway Edge Function from Session 6 to be the single call path for all agent LLM calls going forward — log every call to agent_actions.
3. Build the confidence scoring described in Part 4.1: combine exact-amount/date-proximity (already have this from Session 7) with a semantic vendor-match signal using embeddings (embed bank_transaction descriptions and historical matched payee names into transaction_embeddings, compare via cosine similarity) and a historical-pattern signal (has this exact payee/amount combo matched this way before for this tenant).
4. Implement the autonomy policy from Part 6.1: Sc ≥ 0.95 → auto-match and auto-post immediately (status='auto_matched', created_by_agent=true) with a visible "undo" in the UI that triggers a reversing entry, not a delete. 0.70–0.95 → needs_review with the match_signals explanation shown in the UI (this replaces Session 7's plain rule-based candidates). Below 0.70 → flagged as an exception, shown separately, never silently dropped.
5. Add a per-tenant setting for the auto-match threshold (default 0.95) stored in tenants.settings, per the Policy Engine concept in Part 6.1.
6. Update the Reconciliation Center UI from Session 8 to show the confidence score and explanation ("why") for every match, and a distinct "Exceptions" tab.

Update CONTEXT_LOG.md with the scoring approach and where the embedding generation happens (should be async via the same pgmq pattern, not blocking the webhook).
```

**Verify:**
- [ ] A handful of your test transactions auto-match correctly and post without you clicking anything
- [ ] Reject an auto-match and confirm it creates a clean reversing entry, not a broken ledger state
- [ ] Confidence explanations are genuinely readable, not just a raw number

---

## Session 10 — AI Chat Assistant (RAG)

**Goal:** the "VitaCount Intelligence AI Chat assistant for bookkeeping questions" line item from the Starter tier.

```
Read project.md and CONTEXT_LOG.md first.

Build a conversational assistant scoped to the current tenant's data:

1. A chat UI (simple, persistent per tenant or per session — your call, keep it simple for MVP) that calls a new Edge Function via the shared llm-gateway.
2. Give the assistant tool-calling access to a small, safe, read-only subset of the tool registry described in project.md Part 6.1/Part 5: get_party_ledger-equivalent queries, get_pending_receivables, get_profit_and_loss-equivalent report queries, search contacts/invoices/bills. Do NOT give it write tools yet (no posting, no sending payments) — this session is Q&A only, e.g. "what's my cash position," "which invoices are overdue," "how much did I spend on software this month."
3. Ground answers in the tenant's actual ledger data via these tool calls — never let it answer financial questions from general knowledge alone.
4. Log every chat exchange to agent_actions with agent_name='support_chat_agent' (or similar), status='proposed' isn't quite right here since it's read-only — use a simpler log table or reuse audit_log with actor_type='agent' for traceability.
5. Make sure RLS still applies — the assistant's tool calls must run with the same tenant-scoped permissions as the logged-in user, never a service-role bypass.

Update CONTEXT_LOG.md.
```

**Verify:**
- [ ] Ask it 5–6 realistic owner questions ("what do I owe this month," "who owes me money," "what's my biggest expense category") and confirm answers match the reports from Session 8
- [ ] Confirm it can't see or answer about a different tenant's data even if you try to prompt it into doing so

---

## Session 11 — Subscription Billing & Plan Gating

**Goal:** actually charge the 3 tiers from `VitaCount_Plans.pdf`, and make sure feature access matches plan.

```
Read project.md and CONTEXT_LOG.md first.

Build per project.md Part 8:

1. Migration: plan_features, usage_events per Part 2.12/Part 8.
2. Stripe: create the 3 subscription products/prices in Stripe (Starter $14.99/mo, Growth $79/mo, Pro $159/mo — I'll create these in the Stripe dashboard, tell me the exact fields to fill in), build the checkout/upgrade flow, handle Stripe subscription webhooks to update tenants.plan_tier.
3. Feature gating: since MVP only actually implements Starter-tier features (per this playbook's scope), plan_features for now should mostly just gate against "you're on Starter, upgrade to unlock Projects/Inventory" UI stubs for the not-yet-built Growth features — don't fake-enable something that doesn't exist yet, show an honest "coming soon, included in Growth" state instead.
4. Usage metering: instrument usage_events inserts at the key points already built (journal_entry_posted, document_processed, ai_completion) — wire the Stripe metered-usage reporting for these now even though Starter is currently unlimited, so the pipe exists before you need it for future usage-based add-ons.
5. Billing settings page: current plan, usage this period (mirror the "78% usage" style widget from the dashboard screenshot), upgrade/downgrade, payment method management (Stripe Customer Portal is fine here, don't build a custom one).

Update CONTEXT_LOG.md with the Stripe product/price IDs structure and webhook events being handled.
```

**Verify:**
- [ ] Sign up a fresh test tenant, subscribe to Starter via Stripe test card, confirm tenants.plan_tier updates correctly
- [ ] Confirm the billing settings page shows real usage numbers, not placeholders

---

## Session 12 — Production Hardening & Launch

**Goal:** ready for real paying users, not just your own testing.

```
Read project.md and CONTEXT_LOG.md — this is the full history of everything built.

Do a hardening pass before we take this to real users:

1. RLS audit: go through every table built across all sessions and confirm every single one has RLS enabled with a correct tenant-scoped policy — write a script or test that lists all tables and flags any without RLS enabled at all (this is the most common way multi-tenant SaaS apps leak data).
2. Error monitoring: wire up Sentry (or your recommendation) for both the Next.js app and the Edge Functions.
3. Backups: confirm Supabase's point-in-time recovery is enabled on the project (tell me where to check/enable this in the dashboard).
4. Rate limiting on the llm-gateway function and any public-facing API routes.
5. Legal/compliance pages: basic Terms of Service and Privacy Policy pages (I'll provide final copy, just scaffold the routes and link them from signup).
6. Onboarding polish: review the signup → create workspace → connect bank → first invoice flow end to end and smooth out any rough edges you find.
7. Load-check: seed a tenant with a few thousand journal entries and confirm the dashboard/reports still load acceptably fast; add indexes where needed (particularly journal_entry_lines(tenant_id, account_id) and bank_transactions(tenant_id, status)).
8. Deploy: connect the repo to Vercel, set production env vars, push the migrations to the hosted Supabase project with supabase db push, do a final smoke test in production.

Update CONTEXT_LOG.md one last time with a "MVP shipped" summary and a clear list of what's next (Projects/Inventory/Forecasting/remaining agents per project.md Part 9, M4/M6/M8-onward).
```

**Verify:**
- [ ] A brand new signup, on a fresh browser/incognito, can complete the entire flow — signup → workspace → invite teammate → connect bank → send invoice → get paid → see it reconciled → ask the AI assistant about it — with zero manual database intervention from you
- [ ] You've personally confirmed RLS blocks cross-tenant access at least once with real queries, not just trusting the policy exists

---

## After MVP ships

Real users first, then build order for V1 (already specced in `project.md` Part 9): Projects/job costing (M4) → FIFO Inventory (M4) → Forecasting (M6) → remaining agents — AR Collections, Inventory Reorder, Project Margin, Anomaly, Command Center orchestrator (M8) → Public API + MCP server (M9) → the rest of production hardening for scale (M10, SOC 2 track). Don't start V1 until you have at least a few weeks of real usage data from MVP — it'll change what you prioritize.

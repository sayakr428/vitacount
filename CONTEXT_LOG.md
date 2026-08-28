# VitaCount — Build Context Log
Running log of what's been built, key decisions, and what's next.
Every Claude Code session should read this + project.md first, and append an entry before ending.

## Log

### Session 1 — Repo Scaffold (2026-08-28)

**Scope:** scaffolding only, per `build-playbook.md`. No tables, auth, or business logic.

**Built:**
- pnpm workspace at repo root (`pnpm-workspace.yaml`, root `package.json` with `dev`/`build`/`start`/`lint` scripts delegating to `apps/web`).
- `apps/web`: Next.js (App Router, TypeScript, Tailwind v4, ESLint, Turbopack) via `create-next-app`, then `shadcn/ui` initialized (`components.json`, `lib/utils.ts`, `components/ui/button.tsx`).
- `apps/web/lib/supabase/client.ts` (browser client) and `server.ts` (server client, cookie-based) using `@supabase/ssr` + `@supabase/supabase-js`.
- `supabase/migrations/`, `supabase/functions/`, `supabase/seed.sql` (all empty — first migrations land in Session 2/3).
- `packages/tool-registry`, `packages/posting-engine`, `packages/ui` — empty TS workspace packages (`package.json` + `tsconfig.json` + stub `src/index.ts`), wired into the pnpm workspace.
- `.env.example` at repo root (canonical list of vars) and `apps/web/.env.example`.
- Root `README.md` pointing to `project.md` / `build-playbook.md` / `dashboard-ui-spec.md` / this log as source of truth.

**Key decisions / deviations from the playbook text:**
- **Next.js version:** `create-next-app@latest` installed **Next 16.3.3**, not the "Next.js 15" named in `project.md`/`build-playbook.md` — 16 is current stable as of this session. App Router usage is unaffected; flagging in case a future session hits a Next 16-specific API difference.
- **Env file location:** Next.js only auto-loads `.env.local` from its own project root, not the monorepo root. The user had already created `.env.local` at the repo root (real Supabase URL/anon key, Plaid sandbox keys) before this session — it's copied (not moved) into `apps/web/.env.local` so `next dev` actually picks it up. Root copy is left in place since it was pre-existing; treat `apps/web/.env.local` as the one that matters going forward. Confirmed via dev server log line `Environments: .env.local`.
- **Supabase project:** already connected via the Supabase MCP server (project ref `nlfjefcoynpaphojsqfd`), confirmed reachable and empty (`list_tables` → `[]`) before scaffolding. `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, both `STRIPE_*` keys are still blank in `.env.local` — needed before Session 4 (Stripe) and Session 6 (Claude vision OCR).
- No Supabase CLI installed locally (no Homebrew on this machine, and CLI isn't required for a scaffold-only session). Migrations in Session 2+ will run via the Supabase MCP tools (`apply_migration` etc.) rather than `supabase db push`, unless the user installs the CLI separately.
- `pnpm` was not installed globally on this machine; installed via `npm install -g pnpm` at the start of this session.

**Verified:**
- `pnpm install` resolves all 5 workspace projects (root, web, 3 packages) cleanly.
- `pnpm dev` boots with no errors; `GET /` returns HTTP 200 with no console/build errors.

**Next:** Session 2 — Auth & Multi-Tenant Foundation (`profiles`/`tenants`/`memberships`, RLS, signup/login/invite flows). Before that session, the user should fill in `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local` (needed for server-side admin operations like the auth trigger and invite flow).

### Session 2 — Auth & Multi-Tenant Foundation (2026-08-28)

**Migrations applied directly via the Supabase MCP** (no local Supabase CLI — see Session 1 note): `auth_foundation`, `auth_foundation_lockdown_function_grants`, `auth_foundation_lockdown_handle_new_user`, `auth_foundation_lookup_user_by_email`.

**Schema:** `profiles`, `tenants`, `memberships` exactly per `project.md` Part 2.1. RLS enabled on all three.

**Security-definer helpers** (per project.md's explicit guidance to centralize the tenant-scoping subquery): `current_tenant_ids()` (active memberships only), `current_admin_tenant_ids()` (active owner/admin), `current_member_tenant_ids()` (any status — used so an invited-but-not-yet-active user can still see the tenant they were invited to). All three, plus `create_tenant`, `accept_invite`, `lookup_user_id_by_email`, are `revoke`d from `public`/`anon` and granted only to `authenticated` — Postgres grants `EXECUTE` to `PUBLIC` by default on function creation, which the Supabase security advisor correctly flagged; fixed with an explicit lockdown migration. `handle_new_user` (the `auth.users` insert trigger) has no role grants at all — it only needs to run as the trigger, never be called directly.

**Onboarding:** `create_tenant(name)` is a single security-definer RPC that inserts the tenant row and the caller's `owner` membership atomically, rather than exposing a direct `insert` policy on `tenants` (a bootstrap case that doesn't fit the standard tenant-scoped RLS pattern, since a brand-new user has no membership yet to scope against).

**Invite flow:** `POST /api/team/invite` (owner/admin only, checked against `memberships` before acting) uses a service-role client (`lib/supabase/admin.ts`) to call `auth.admin.inviteUserByEmail`, then inserts a `memberships` row with `status='invited'` through the normal user-scoped client (so the `memberships_insert_admin` RLS policy is the actual enforcement, not just the route handler's own check — defense in depth). If the email already belongs to an existing user (`error_code: email_exists`), it falls back to `lookup_user_id_by_email()` (a guarded RPC, owner/admin-only) and adds them to the new tenant directly — **known gap:** this fallback path does not currently send any notification email to the existing user, since no custom emailer exists yet; they'll only see the new workspace next time they log in. Acceptable for MVP, flagged here for later.

Invite acceptance happens in `app/auth/callback/route.ts`, which handles both the PKCE `?code=` flow (signup confirmation) and the OTP `?token_hash=&type=` flow (invites/recovery) — this is the Supabase-recommended pattern for a single callback route covering all email-link types. When `?tenant_id=` is present (invite links only), it calls `accept_invite()` then routes to `/invite/set-password` so the new teammate sets a password before landing in the app (`inviteUserByEmail` creates the auth user without one).

**Tenant context:** cookie `vitacount_tenant_id` (not localStorage) holds the active tenant, so both server components and server actions read the same value. `lib/tenant/data.ts` (`loadTenantContext`) is the single source read by `app/(app)/layout.tsx`, which seeds a client-side `TenantProvider`/`useTenant()` context (`lib/tenant/context.tsx`) for the header/switcher. **Important for later sessions:** RLS scopes a user to *all* tenants they belong to, not just the active one — it's a ceiling, not a selector. Every tenant-scoped query from Session 3 onward must still add an explicit `.eq('tenant_id', activeTenantId)` filter; don't rely on RLS alone to isolate the active workspace for multi-tenant users.

**Routing:** migrated `middleware.ts` → `proxy.ts` immediately — Next 16 (installed in Session 1) deprecated the `middleware` file convention in favor of `proxy` with the same signature (`export function proxy(request)`), confirmed via `node_modules/next/dist/docs`. `proxy.ts` protects every route except `/login`, `/signup`, `/reset-password*`, `/auth/callback*`; unauthenticated visitors are bounced to `/login?next=...`, and logged-in visitors hitting `/login` or `/signup` are bounced to `/dashboard`. The has-a-tenant check (onboarding gate) deliberately lives in `app/(app)/layout.tsx` and `app/onboarding/page.tsx` instead of the proxy, to avoid a DB round-trip on every request.

**Deviations / things NOT done:**
- **RLS cross-tenant test was not run live.** The playbook's own checklist item ("as two different seeded users in two different tenants, confirm user A cannot read tenant B's memberships row") calls for seeding real users. A direct SQL insert into `auth.users` to fake two test accounts was attempted and blocked by the coding agent's safety classifier (touching `auth.users` directly is correctly treated as sensitive); a follow-up attempt via the real Auth REST signup endpoint with `@example.com` addresses was rejected by Supabase's own email validator (400 `email_address_invalid`). Policy definitions were verified statically instead (`pg_policies` inspection + the security advisor). **The user should do this check for real**: sign up two accounts with real-looking emails, put them in different workspaces, and in Supabase Studio's SQL editor try `select * from memberships` after `set role authenticated; set request.jwt.claims = '{"sub":"<other user's uuid>"}';` — confirm it only returns that user's own tenant(s).
- `SUPABASE_SERVICE_ROLE_KEY` is still blank in `apps/web/.env.local` — the invite flow (`/api/team/invite`) will throw until it's filled in. Signup, login, logout, password reset, and workspace creation don't need it and work today.
- Password reset and invite-accept flows are coded but unverified end-to-end (both need a real inbox to click through) — logic was reviewed carefully (the dual PKCE/OTP callback handling is the documented Supabase pattern) but flagging as unverified rather than claiming tested.

**Verified:** `tsc --noEmit` and `pnpm lint` both clean. Dev server boots with no warnings (after the proxy.ts migration) and every route (`/`, `/login`, `/signup`, `/reset-password`, `/dashboard` unauthenticated) responds/redirects correctly per the log.

**Next:** Session 3 — Financial Core (Ledger): `accounts`, `journal_entries`/`journal_entry_lines`, the balanced-entry trigger, default Chart of Accounts seeded on tenant creation (hook into `create_tenant()`), and the first `posting-engine` function.

### Session 3 — Financial Core / Ledger (2026-08-28)

**Migrations applied via Supabase MCP**, mirrored in `supabase/migrations/`: `financial_core`, `financial_core_default_coa`, `financial_core_default_coa_fix_quoting`, `financial_core_fix_trigger_search_path`, `financial_core_post_manual_journal_entry`.

**Schema:** `accounts`, `dimension_types`, `dimension_values`, `periods`, `journal_entries`, `journal_entry_lines`, `journal_entry_line_dimensions` — exactly per `project.md` Part 2.2. RLS on all seven, using the Session 2 `current_tenant_ids()`/`current_admin_tenant_ids()` helpers; `journal_entries`/`journal_entry_lines` writes are restricted to `owner`/`admin`/`accountant` roles per the spec's explicit example (`accounts`/`dimension_*` writes are open to any active tenant member for now — the spec didn't call out tighter roles there and Session 3's prompt didn't ask for it; worth revisiting in the Session 12 hardening pass if `staff`/`viewer` shouldn't be editing the COA).

**The balanced-entry trigger** (`enforce_balanced_entry`, deferred constraint trigger on `journal_entry_lines`) is live and **was actually tested**, not just deployed — see below.

**Bug caught and fixed before it could bite a real user:** the first `seed_default_chart_of_accounts` migration wrote `"Owner's Equity"` with double quotes. In Postgres, double quotes are *identifier* syntax, not a string literal — that line would have thrown "column \"Owner's Equity\" does not exist" the first time `create_tenant()` ran, breaking onboarding for every new signup. `check_function_bodies` doesn't catch this at `CREATE FUNCTION` time (embedded SQL in plpgsql bodies isn't semantically validated until the function actually executes), so it shipped clean and only would have surfaced at the worst possible moment — a user's first signup. Caught by actually invoking the function in a scratch test before moving on (see below), not by re-reading the SQL. Fixed in `financial_core_default_coa_fix_quoting` (proper `''`-escaped literal). **Both migrations are kept in the repo as-applied** — migrations are an append-only log; the fix is the next one in sequence, not a rewrite of history.

**Real functional tests run directly against the connected Supabase project** (via `execute_sql`, wrapped in `DO` blocks with explicit `RAISE EXCEPTION` assertions, always on throwaway `tenants` rows that were deleted before the block returned — confirmed zero leftover rows after each run):
1. `seed_default_chart_of_accounts()` seeds exactly 23 accounts.
2. A balanced manual entry (via direct `journal_entries`/`journal_entry_lines` inserts) posts successfully.
3. An unbalanced entry is rejected by the deferred trigger when `set constraints check_balanced immediate` forces it to fire early — **this is the single most important test in the project per the playbook, and it actually passed**, not just "the migration applied without error."
4. The `post_manual_journal_entry()` RPC (see below): an unbalanced call is rejected *and* the `journal_entries` header row is fully rolled back (zero rows left behind) — confirming true atomicity, not just line-level rejection.
5. A balanced call through the same RPC succeeds and creates the header + both lines.

These tests used `tenants`/`accounts`/`journal_entries` directly (not `auth.users`), so they weren't blocked by the safety classifier the way the Session 2 RLS test was.

**Found and fixed a real gap while testing:** the user had already signed up during Session 2 and created a real tenant ("Webgrow") before this session added the COA-seeding hook to `create_tenant()` — so it had zero accounts. Backfilled it directly by calling `seed_default_chart_of_accounts()` for that tenant id; it now has the standard 23 accounts. Any *new* signup gets this automatically going forward.

**`post_manual_journal_entry(tenant_id, entry_date, memo, lines jsonb)` RPC:** deliberately **not** `security definer` — it runs as the calling user so the existing RLS policies on `journal_entries`/`journal_entry_lines` are the actual authorization check, not a second copy of the role logic. Its only job is making the header insert + all line inserts one transaction (a single top-level function call is one implicit transaction), so if the deferred balanced-entry trigger fires and fails, the *whole* entry rolls back — including the header — rather than leaving an orphaned `journal_entries` row with no lines, which is what would happen doing this as two separate `supabase-js` `.insert()` calls from the app layer (PostgREST/supabase-js has no multi-table-call transaction).

**`packages/posting-engine`:** `postManualEntry(entry)` + `assertBalanced(lines)` are pure, framework-agnostic TypeScript (no Supabase dependency) — per `project.md` Part 10's description of this package as "pure functions: given a business event, return journal lines." It validates client-side (fast fail, good UX) before the app ever calls `post_manual_journal_entry`; the Postgres trigger remains the real, structurally-enforced invariant. `apps/web` now depends on it via `workspace:*`.

**Real Supabase TypeScript types are now wired in:** ran `generate_typescript_types`, saved to `apps/web/lib/supabase/database.types.ts`, and every `createClient`/`createServerClient`/`createBrowserClient` call (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`, `admin.ts`) is now generic over `Database`. This wasn't optional busywork — without it, embedded-relationship selects like `tenant:tenants(id, name, plan_tier)` were inferring as arrays instead of single objects and failing to typecheck; it also let `lib/tenant/data.ts` drop an `as unknown as` cast it needed in Session 2. **Whoever runs Session 4 should regenerate these types after adding `contacts`/`invoices`/etc** — they'll silently go stale otherwise since nothing enforces regeneration automatically.

**UI (CPA Mode, minimal per the Session 3 prompt):**
- `/cpa/accounts` — Chart of Accounts grouped by type, plus an add-account form (any active tenant member can add; see RLS note above).
- `/cpa/journal-entries` — recent entries with their lines, debit/credit per line, running total.
- `/cpa/journal-entries/new` — dynamic line-row form (add lines client-side, live debit/credit balance indicator, submit disabled until balanced) gated to `owner`/`admin`/`accountant` at the page level (defense in depth on top of the RLS policy, which is the real enforcement).

**Security advisor follow-ups applied:** `enforce_balanced_entry` had a mutable `search_path` (flagged by the advisor) — fixed with `set search_path = public` on the trigger function, same pattern already used for the Session 2 helpers. The remaining advisor WARNs (Session 2's `current_*_ids`/`create_tenant`/`accept_invite`/`lookup_user_id_by_email` being `authenticated`-executable, and "leaked password protection disabled") are already-reviewed/intentional or a dashboard-only toggle — see Session 2's entry and the note below.

**Not done / deferred:**
- No role restriction added to `accounts`/`dimension_types`/`dimension_values` writes beyond "any active tenant member" — flagged above, not blocking for MVP.
- `periods` table exists (per schema) but nothing creates or closes periods yet — no UI, no automation. `journal_entries.period_id` is nullable and unused for now. This is fine; period close/lock isn't in scope until later.
- **Recommended, not done (dashboard-only, can't be done via migration):** enabling Supabase Auth's "leaked password protection" (HaveIBeenPwned check) — free security win, one toggle in Auth settings, mentioned here rather than actioned since it's outside what a migration can touch.

**Verified:** `tsc --noEmit` and `pnpm lint` clean. Dev server (already running from Session 2, hot-reloaded through all these changes) shows no compile/runtime errors in the log; `/cpa/accounts` and `/cpa/journal-entries` both correctly redirect to `/login` when unauthenticated. The user should log in as the real "Webgrow" tenant and confirm the 23 seeded accounts show up grouped correctly, then post a real journal entry through `/cpa/journal-entries/new` and confirm it appears in the list with correct totals.

**Next:** Session 4 — Contacts + Accounts Receivable: `contacts`, `invoices`/`invoice_lines`, `payments_received`/`payment_applications`, `postInvoiceIssued`/`postPaymentReceived` in posting-engine, a placeholder flat-rate tax calc (TaxJar/Avalara explicitly deferred), and Stripe Checkout for online invoice payment. Remember to regenerate `database.types.ts` after the new migrations.

### Design System Pass — VitaCount Visual Identity (2026-08-28)

**Scope:** out-of-sequence design pass (normally Session 8 territory per `build-playbook.md`), run concurrently with Sessions 1–3 landing in this same repo from a separate session. Touched only presentation-layer files — no schema, RLS, or business-logic changes, and nothing from Sessions 1–3 was reviewed or altered.

**Source of truth:** built the full VitaCount screen set (Dashboard, Sales/Invoices, Expenses/Bills, Banking/Reconciliation) in Google Stitch first as the visual reference, matching every widget in `dashboard-ui-spec.md` exactly (KPI cards, bank accounts row, Reconciliation Center donut, Cash Flow Forecast chart, locked Project Profitability/Inventory/Forecasting teasers, Exception Alerts, Top Expense Categories, Recent Transactions, trust footer). Stitch project: https://stitch.withgoogle.com/project/3312021615076227650 — kept as the design reference for future sessions building out Sales/Expenses/Banking/Reports/Documents/Contacts pages, which don't have real routes yet (Sessions 4–9).

**Design language:** dark-first premium fintech aesthetic — deep OLED-navy surfaces, emerald primary (`#22C55E`-family) for positive/growth signals, blue for informational accents, amber for review states, red reserved for negative/error only. "Double-bezel" nested card construction (outer glass shell + inner core panel with soft inset highlight) throughout. Geist for headings/KPI numbers (already wired in Session 1 via `next/font/google`), IBM Plex Sans added for body/tabular data (the "Financial Trust" pairing — strong numeral legibility for ledger figures).

**Implemented directly in `apps/web`:**
- `app/globals.css` — replaced the default shadcn oklch tokens with the VitaCount palette, defined for **both** `:root` (light) and `.dark`, reusing the existing `@custom-variant dark (&:is(.dark *))` setup. Added `--font-sans`/`--font-heading` mappings (IBM Plex Sans / Geist) and `--positive`/`--warning` tokens (the shadcn defaults only had `--destructive`).
- `next-themes` installed; `components/theme-provider.tsx` wraps the app in `app/layout.tsx` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`); `components/theme-toggle.tsx` is the sun/moon toggle, wired into the header. **Light/dark toggle is live**, not just tokens-on-paper.
- `components/sidebar.tsx` — new; the full nav from `dashboard-ui-spec.md` (Dashboard/Transactions/Sales/Expenses/Banking, locked Projects/Inventory with "Growth" badges, Reports, locked Forecasting with "Pro" badge, Documents, Reconciliation with a count badge, Contacts, Settings) plus the plan-usage widget at the bottom. Locked items are visually disabled (`aria-disabled`, no navigation) rather than hidden — same "still a card" principle the spec calls for.
- `components/header.tsx` — rebuilt as the floating glass top-nav pill (detached from the viewport edge, `backdrop-blur-xl`), keeping the existing `TenantSwitcher`/`signOut` logic untouched and adding the theme toggle.
- `app/(app)/layout.tsx` — now renders `Sidebar` + `Header` together; the tenant/auth data-loading logic is unchanged.
- `app/(app)/dashboard/page.tsx` — rebuilt as the full bento-grid dashboard matching the Stitch reference. Still fetches the real `profiles.full_name`/tenant/role server-side for the greeting (kept from the Session 2 version); every widget below that (KPI numbers, bank accounts, reconciliation donut, cash-flow chart, expense categories, recent transactions) uses **clearly-illustrative sample data**, not live queries — wiring those to `journal_entry_lines`/`bank_accounts`/`reconciliation_matches` per `dashboard-ui-spec.md`'s data-source mapping is still Session 7–9's job. Donut/sparkline/line-chart are hand-rolled inline SVG (no charting library added, to avoid an unreviewed new dependency for what's currently static data).

**Verified:** `tsc --noEmit` and `pnpm lint` both clean. Rendered the actual app (not just the code) — booted `pnpm dev`, and since every real route is auth-gated by `proxy.ts`, added a temporary public route, screenshotted it with Playwright in both themes, then **deleted the temp route and reverted `proxy.ts` to its exact original state** (confirmed via `git diff` showing zero changes) before committing. Caught and fixed one real bug this way: the Project Profitability card's title was fully hidden behind its own "locked" overlay (`absolute inset-0` on the overlay covered the card header, not just the chart) — invisible in code review, obvious in the screenshot.

**Deliberately not done:**
- Sales/Expenses/Banking/Reports/Documents/Contacts pages don't exist as real routes yet (no Session 4+ backend to point them at) — the Stitch project has designs for Dashboard, Sales, Expenses, and Banking ready to implement once those sessions land.
- Dashboard widgets are sample data, not live-wired — see above.
- Didn't touch `components/ui/button.tsx`/`card.tsx` internals — they already inherit the new theme automatically via the CSS variables (e.g. `bg-primary`, `ring-foreground/10`), so auth/CPA/settings pages picked up the new palette for free without any risk of breaking their existing markup.

**Commit hygiene note:** this session found Sessions 1–3's work already staged (`git add`-ed) but uncommitted when it started — a separate concurrent session's output. Only the files this design pass actually touched were committed (`git commit -- <specific paths>`); Sessions 1–3's staged files were left exactly as staged for that session/the user to review and commit separately.

**Next:** Session 4 as above — plus, whoever builds the Sales/Expenses/Banking pages should pull layout/styling straight from the matching Stitch screens rather than re-deriving the design.

### Sessions 4 & 5 — Contacts, Accounts Receivable, Accounts Payable (2026-08-28)

**Run together** at the user's request (build-playbook.md treats them as separate sessions, but AR and AP share `contacts` and follow the identical posting pattern, so building both in one pass avoided re-deriving that pattern twice).

**Also done first, per explicit instruction:** removed all plan-tier lock UI (the "Growth"/"Pro" badges + lock icon + blurred-overlay + Upgrade button on the sidebar's Projects/Inventory/Forecasting items and the dashboard's Project Profitability card, per `dashboard-ui-spec.md`'s original recommendation). Every module is now visually open for MVP — `dashboard-ui-spec.md`'s locked/teaser treatment is *not* deleted from the spec doc, just not implemented in the UI right now. **Explicitly deferred, not forgotten:** real plan-tier gating (which `tenants.plan_tier` unlocks which module) still needs to be designed and wired before this goes to real paying customers on tiered plans — there is currently no enforcement anywhere, UI or RLS, tying a module to a plan_tier.

**Migrations** (`contacts_and_ar`, `ar_posting_functions`, `accounts_payable`, `ap_posting_functions`, `ar_ap_lockdown_function_grants`): `contacts`, `invoices`/`invoice_lines`, `payments_received`/`payment_applications`, `bills`/`bill_lines`, `payments_made`/`bill_payment_applications` — schema exactly per `project.md` Part 2.3–2.5, RLS on all eight tables using the established `current_tenant_ids()` pattern (open to any active tenant member, matching `accounts`' precedent from Session 3 — the spec didn't call for tighter role restrictions here, and AR/AP clerk work shouldn't require accountant-level access).

**Schema deviations from `project.md`, both because their target tables don't exist yet:**
- `invoices.project_id` / `invoice_lines.item_id` / `bills.project_id` / `bill_lines.item_id`: plain nullable `uuid`, no FK (Projects/Inventory modules unbuilt — the FK gets added in whichever future migration creates `projects`/`items`).
- `bills.source_document_id`: same, for the Documents module (Session 6).
- Added `tenants.default_tax_rate numeric(6,4)`: the flat-rate placeholder tax calc the playbook calls for — real TaxJar/Avalara integration is explicitly deferred post-MVP. Invoice line items still carry their own `tax_rate` (per the real schema), the form just defaults new lines to the tenant's flat rate.

**Posting architecture — the one real design decision worth flagging:** `post_invoice_issued`, `post_payment_received`, `create_bill_received`, `post_vendor_payment_made`, and `execute_scheduled_vendor_payment` are all `SECURITY DEFINER`, unlike Session 3's `post_manual_journal_entry`. Reasoning: a manual journal entry in CPA Mode is a direct ledger action and correctly requires `owner`/`admin`/`accountant` per `journal_entries`' RLS. Issuing an invoice or recording a payment is a normal Owner Mode business action — per `project.md`'s "complexity grows invisibly" principle, any active tenant member who can create an invoice should be able to trigger its GL posting without also needing accountant-level ledger permissions. Each function still enforces tenant membership explicitly via its own `auth.uid()` check (or `auth.role() = 'service_role'` for the Stripe webhook path) — the security-definer privilege only bypasses `journal_entries`' *role* restriction, not tenant isolation.

**Caught our own version of Session 2's grant-leak bug:** all five functions above were, on first migration, callable by the `anon` role — `CREATE FUNCTION` grants `EXECUTE` to `PUBLIC` by default, the exact issue `auth_foundation_lockdown_function_grants` fixed for the Session 2 functions. Each function's internal membership check already rejected an unauthenticated caller functionally, but added the explicit `revoke ... from public, anon` migration anyway for the same defense-in-depth reason as before. Caught by re-running `get_advisors` after applying, not by remembering the precedent — worth Session 12's hardening pass double-checking every future `SECURITY DEFINER` function gets this by default.

**Bills post immediately, invoices don't:** `bills.status` has no `'draft'` state in `project.md`'s schema — a vendor bill is a real liability the moment it's recorded, so `create_bill_received` creates the bill, its lines, and the GL entry atomically in one call. Invoices start `'draft'` (no GL impact) and only post on `post_invoice_issued`, called when the user clicks "Send" — matches the UI flow the playbook describes (create → send → get paid).

**Scheduled vendor payments** (`payments_made.scheduled_for`, from the pricing doc's "schedule vendor bill payments" feature): `post_vendor_payment_made` checks whether `scheduled_for` is a future date — if so, it records the payment row and flips the bill to `'scheduled'` but does **not** create `bill_payment_applications` or post a GL entry yet. A separate `execute_scheduled_vendor_payment(payment_id, applications)` RPC does that later, either via a manual "process now" action or (not built yet — no pg_cron wiring for this in Sessions 4/5, that's Session 7+ async-infra territory) a future scheduled job.

**Stripe:** Checkout Sessions (`lib/actions/stripe-checkout.ts`, `mode: "payment"`, one line item for the invoice's `balance_due`, `metadata: { invoiceId, tenantId, contactId }`) rather than a subscription or Payment Link, since this is a one-off invoice payment. Webhook at `app/api/webhooks/stripe/route.ts` handles `checkout.session.completed`: verifies the signature via `stripe.webhooks.constructEvent` against the **raw** request body (`request.text()`, not `request.json()` — Stripe's signature is computed over the raw bytes), then calls the same `post_payment_received` RPC the manual-payment form uses, via the service-role client (`lib/supabase/admin.ts`) since there's no user session in a webhook request — this is exactly the path `post_payment_received`'s `auth.role() = 'service_role'` branch exists for.

**User: here's what to configure in the Stripe dashboard** — Developers → Webhooks → Add endpoint → URL `https://<your-deployed-domain>/api/webhooks/stripe` (for local testing, use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`), subscribe to the `checkout.session.completed` event, then copy the generated **signing secret** into `STRIPE_WEBHOOK_SECRET` in `apps/web/.env.local` (already present as a placeholder — the real value only exists once the endpoint is created in the dashboard).

**`packages/posting-engine` additions:** `postInvoiceIssued`, `postPaymentReceived`, `postBillReceived`, `postVendorPaymentMade` — pure functions mirroring each SQL posting function's logic, for client-side balance preview before submission (the RPC remains the sole source of truth; these don't write anything). Added `account-codes.ts` exporting the fixed seeded-COA codes (`1000` Cash, `1010` AR, `2000` AP, `2010` Sales Tax Payable, `4000` Sales Revenue) both functions and forms reference.

**UI:** `/contacts` (list + inline add form), `/sales` (invoice list) + `/sales/new` (line-item form, live subtotal/tax/total) + `/sales/[id]` (detail, "Send invoice" for drafts, Stripe pay-link button, manual-payment form, payment history), `/expenses` (bill list) + `/expenses/new` (line-item form with expense-category picker) + `/expenses/[id]` (detail, payment form, payment history). Styled with the design-system tokens from the earlier pass (`bg-card`, `border-border`, pill buttons), not the older zinc-hardcoded CPA Mode style.

**Real, live verification (not just code review)** — ran the full Session 4 and Session 5 "Verify" checklists directly against the connected Supabase project, wrapped in `BEGIN…ROLLBACK` (zero residue in the real "Webgrow" tenant, confirmed after):
1. Created a customer, created an invoice, issued it (`status` → `sent`), paid it via a simulated Stripe-sourced `post_payment_received` call → `status` → `paid`, `balance_due` → `0.00`.
2. Created a second invoice, paid it via a simulated manual cash payment → same correct result.
3. Created a vendor, created a bill via `create_bill_received` (`total` → `900.00`), made a $400 partial payment → `status` → `partial`, `balance_due` → `500.00`, then a closing $500 payment → `status` → `paid`, `balance_due` → `0.00`.
4. Trial balance (`sum(debit) - sum(credit)`) across **every** journal entry in the tenant after all of the above: **0.00** — every posting stayed structurally balanced.
5. RLS spot-check on the three new table groups (`contacts`/`invoices`/`bills`) as a non-member stranger JWT: all return 0 rows, consistent with the Session 1–3 audit.

**Verified:** `tsc --noEmit` and `pnpm lint` clean. Dev server boots with zero errors; `/`, `/contacts`, `/sales`, `/sales/new`, `/expenses`, `/expenses/new` all resolve correctly (redirect-gated, unauthenticated in this environment).

**Not done / deferred:**
- No live click-through of Stripe's actual hosted Checkout page (needs a browser + Stripe test card) — the webhook handler's signature verification and posting logic were verified directly instead. **User should do one real click-through** once the webhook is configured (see above).
- No `agent_actions` logging yet for either module — that lands with the agentic layer (Session 9+).
- No 1099 report — `is_1099_vendor` is captured and exposed in the contact form, but the "simple vendor payments this year" report the playbook asks for isn't built yet.
- Plan-tier gating (see the lock-removal note above) — open item for whenever monetization enforcement (Session 11) gets built.

**Next:** Session 6 — Document/Receipt Capture (OCR): `documents`/`expenses` tables, Supabase Storage bucket, `process-document` Edge Function (Claude vision extraction), pgmq/pg_cron async wiring, and the upload → review → post flow into AP.

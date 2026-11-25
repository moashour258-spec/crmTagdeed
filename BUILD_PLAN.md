# BUILD_PLAN — phases, deliverables, "done" criteria

**Working rules for Cursor**
1. Execute **one phase at a time**, in order. Do not start phase N+1 until every "Done when" item of phase N passes and its tests are green.
2. Read `PRD.md` (rules), `DATABASE.md` (schema/RPC), `SECURITY.md` (tests) and `.cursor/rules/*` before each phase.
3. No mock data. Everything runs against the Supabase **dev** project.
4. Every phase ends with: migrations committed, types regenerated (`supabase gen types`), tests added, a short `CHANGELOG.md` entry.
5. If a requirement conflicts or is unclear, **stop and ask** instead of guessing.

Suggested folder layout:
```
app/(auth)  app/(account)  app/(admin)  app/(sales)  app/(print)
components/ui  components/shared  components/{admin,sales}
lib/supabase/{server,client,admin}.ts  lib/auth  lib/validators  lib/crypto  lib/i18n  lib/format
supabase/migrations  supabase/tests  supabase/seed.dev.sql
scripts/seed-super-admin.ts
i18n/ar.json  tests/e2e
```

---

## Phase 0 — Foundation
**Build**
- Next.js (App Router, TS strict), Tailwind, `next-intl` (Arabic only, `dir="rtl"`), font (Cairo / IBM Plex Sans Arabic), `next/font`.
- Design tokens exactly as defined in `BRANDING.md` (colors, Cairo font, radius, shadows, logo placement, favicon generated from the logo). Base UI kit (themed light/dark with `next-themes`, theme toggle in topbar; overlay primitives centered with flex only, tested by Playwright screenshots at 360/768/1440 px in RTL): Button, Input, Select, Dialog (confirm), Toast, DataTable (server pagination), EmptyState, Skeleton, StatCard, Badge, Sidebar + Topbar shell, responsive (table → cards on mobile).
- Supabase clients (server/browser/admin), env validation (`zod`), `.env.example`, lint rules (no `ml-/mr-`, no service-role import outside admin module).
- All migrations from `DATABASE.md`: enums, tables, constraints, indexes, triggers, helper functions, RLS, views, RPC stubs (real bodies arrive in their phases), storage bucket + policies, reference seed (categories, settings).
- `scripts/seed-super-admin.ts` (idempotent; reads `SUPER_ADMIN_EMAIL/PASSWORD` from env; creates confirmed Auth user, profile `active`, `is_super_admin`, role admin, `profile_completed=true`).
- CI: typecheck, lint, unit tests, `supabase db lint`.

**Done when**: `supabase db reset` on dev applies cleanly; seed creates the Super Admin; shell renders in RTL on 360 px and desktop; RLS enabled on 100% of public tables (query proves it).

## Phase 1 — Auth, gates, users
**Build**: login (email + password only, no social login), forgot/reset password, user change-password with random generator, forced `/change-password`, `/disabled`, `/complete-profile` (Zod + national-ID validator + encryption), middleware gates, role layouts, `/account`. User management: **Add user** with 3 options (invitation email / generated random password shown once / custom password; Sales by Admin, Admin by Super Admin), `account_provisions` + trigger, edit, role change rules, activate/deactivate with side effects and global sign-out, password actions on a user (send reset link / random temporary / custom temporary), masked national ID + reveal (audited). Notifications table + bell (basic).
**Done when**: flows in PRD §3 work end to end; SECURITY tests 1–3, 7, 8, 17 pass; Playwright: Admin creates a user with each of the 3 options → login → forced password change → profile gate → role redirect; direct sign-up attempt with an unknown email fails.

## Phase 2 — Catalog (stores, categories, products)
**Build**: stores CRUD (code immutability, delete/deactivate rules, move products), categories (2-level, seed, reorder), products CRUD, code generation trigger, media = images + videos (direct signed uploads with progress, server verification, poster/duration, gallery manager with reorder/primary/delete, signed URLs), sets + components, duplicate product, activation rule (≥ 1 image), search (trigram), filters, **import** (template download, parse, dry-run preview, `import_products`), commission/min_price fields on product form with live example, audit entries.
**Done when**: codes unique/immutable; import dry-run + commit tested with a bad file; store deactivation blocked while stock exists; Sales roles cannot see any of these tables (test 5, partial).

## Phase 3 — Sales side: catalog, reservation, selling
**Build**: `v_catalog` + Realtime broadcast, Sales catalog (cards, search, category/price filters, details, components), reserve/cancel/extend + expiry job, **basket** (`/sales/cart`: add/remove items, customer data, per-item prices, shared `distributeTotal` helper with unit tests, `preview_sale_earnings(items)`), per-item price request + Admin decision, `complete_sale(items…)` (1–10 items, all-or-nothing, basic commission snapshot per item using `calc_earnings`; bonuses plug in via Phase 4), `my-sales`, customer-data correction, "request correction", notifications for Sales, invoice print page (items + delivery status).
**Done when**: SECURITY tests 4–6, 9, 15 pass; Playwright: reserve → request price → approve → basket with 3 items and a negotiated total → sell; two browsers racing the same product; Sales network responses contain no store/code/min_price.

## Phase 4A — Customer payments, installments, receipts
**Build**: `record_sale_payment`, `set_installment_plan`, `reschedule_installments`, `sale_payment_summary` + `installment_status` views, Admin sale detail page (items, payments timeline, refund with reason, installment table, **cancel item / cancel sale** with required refund when overpaid, installments-need-review flag), **delivery tracking** (`set_delivery`, `/admin/deliveries`, Sales read-only status, late / paid-but-undelivered lists, daily digest), receipts print page, overdue digest job + approvals-inbox entries, Sales read-only payment/installment/delivery view.
**Done when**: tests 14, 18, 19, 20 pass; FIFO installment status verified with unit/SQL tests (partial, overdue, refund rewinds status); receipt numbers sequential under concurrency; `distributeTotal` unit tests (sum exact, remainder on highest-priced item, rounding to whole EGP, upward and downward totals).

## Phase 4B — Commissions & bonuses engine
**Build**: bonus rules CRUD (scope junctions, stacking, caps, temporary dates), final `calc_earnings` + `applicable_bonus_rules`, bulk commission page (filters + manual selection + apply + log + **undo**), commission approval screen (pending tab with payment status, override with reason), payouts (`record_commission_payout`, clawback deduction), `cancel_sale` full logic, Sales earnings page (base / bonus / total / status), settings page (all keys, SA-only guards).
**Done when**: SECURITY tests 10–12 pass; worked examples from PRD verified in SQL tests: (a) 10,000 EGP @ 5% = 500; (b) fixed 300; (c) price range 8,000–20,000 +200 bonus; (d) stacked bonuses with cap; (e) historical commissions unchanged after rule/product edits; (f) bulk 5% on 5,000–15,000 range then undo.

## Phase 5 — Dashboards, reports, audit
**Build**: Admin dashboard (11 KPIs + 6 charts + filters, `admin_dashboard_stats`), Sales dashboard (`fn_my_dashboard`), approvals inbox with live counts, reports + CSV exports (UTF-8 BOM, formula-injection escaping), audit page (filters, diff view, SA vs Admin visibility), polishing of loading/empty/error states, accessibility pass.
**Done when**: Playwright screenshots in light **and** dark for every main page, `axe` shows no contrast violations in either theme, dashboards match SQL ground-truth on a seeded dev dataset (cancelled sales excluded); < 2 s with 10k generated sales; exports open correctly in Excel with Arabic text.

## Phase 6 — Security sign-off & production release
**Build/Do**: run **all** tests in `SECURITY.md §8`; security headers/CSP; dependency audit; remove dev seeds; create `prod` Supabase project, apply migrations, configure Auth (sign-ups disabled, email provider only, Site URL/redirect URLs), storage, env vars on Vercel; run Super Admin seed once on prod; smoke-test on the deployed domain (email login, Add user with each option, product with images and a video, sale, payment, approval, payout, receipt print); write `SETUP.md` verification checklist results.
**Done when**: checklist in `SETUP.md §7` fully ticked on production; owner has changed nothing in code to make it work.

---

## Definition of Done (every feature)
- Matches the rule text in `PRD.md` exactly; Arabic strings from `ar.json`; RTL verified.
- Authorization enforced in DB (RLS/RPC) **and** route layout; no client-side money math.
- Loading, empty, error and success states; confirmation dialog for destructive/financial actions.
- Audit entries for every state change listed in PRD F17.
- Tests written (SQL / unit / e2e as appropriate) and passing; no `any`, no `console.log` of sensitive data.

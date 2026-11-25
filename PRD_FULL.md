# تجديد CRM — FULL SPECIFICATION (single file, build from scratch)

> Complete and final. Build everything from zero following PART 5 (Phase 0 → 6). Logo: `public/logo.jpg` (in the pack). PART 1 rules override everything else; if anything is unclear, ask before coding.

## Table of contents

- 1. Product Requirements
- 2. Branding & dark mode
- 3. Database
- 4. Security
- 5. Build plan
- 6. Agent operations (GitHub / Supabase / Vercel)
- 7. Owner setup
- 8. .env.example
- 9. Kickoff prompt

---



<!-- ===== PRD.md ===== -->

# PART 1. Product Requirements

## PRD — Sales, Inventory, Payments & Commission CRM

> Internal CRM for **تجديد (Tajdeed) — لأدوات منزلية مستعملة**, a company selling **used furniture, household appliances and home equipment** (Egypt).
> Read together with: `DATABASE.md`, `SECURITY.md`, `BUILD_PLAN.md`, `.cursor/rules/*`, `SETUP.md`, `i18n/ar.json`.
> **Every rule in this file was explicitly agreed with the product owner. Do not invent alternatives. If something is ambiguous, ask.**

---

### 1. Goals

1. Admins manage stores, products, employees, commissions, bonuses, customer payments and reports.
2. Sales employees browse available products, reserve them, register sales and track their own earnings.
3. All money logic is **server-side (Postgres)**, auditable, append-only and transaction-safe.
4. Production-ready: secure, RTL Arabic UI, responsive (desktop / tablet / mobile), deployed on Vercel + Supabase.

Non-goals are listed in section 11.

### 2. Stack (mandatory)

Next.js (App Router) + React + TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) · Vercel.
No Firebase / MongoDB / local JSON / ORM. No mock data anywhere: everything runs against a real Supabase `dev` project.

### 3. Users, roles, account lifecycle

#### 3.1 Roles
| Role | Notes |
|---|---|
| `admin` | Full operational access. Manages Sales users. |
| `sales` | Sees only their own money. Never sees store names, `min_price`, other users' data. |
| Super Admin | **Not a role.** A flag `profiles.is_super_admin = true` on exactly one admin (`moashour258@gmail.com`). |

Super Admin only can: create / edit / deactivate / demote **Admin** accounts, see the full audit log, change `bonus_cap_*` and `default_commission_*` settings. A regular Admin cannot touch other Admins. The Super Admin can never be deactivated, demoted or deleted (UI **and** DB trigger). The last active Admin cannot be deactivated.

#### 3.2 Access model: invitation / admin-provisioned accounts only
There is **no self-registration and no Google (or any social) sign-in**. The only way an account exists is that an Admin creates it.
1. Admin (Super Admin for Admin accounts) opens **Users → Add user** and enters: full name, email, role, and chooses **one** of three ways to give access:
   - **Send invitation email** — Supabase `inviteUserByEmail`; the person opens the link and **sets their own password**.
   - **Generate a random password** — the system creates a strong password (16 chars, cryptographically random, no ambiguous characters), shows it **once** in a dialog with a copy button.
   - **Set a custom password** — the Admin types a password (same policy: min 10 chars). 
2. For the two Admin-set options the account is created `active` with `must_change_password = true`: on first login the user is forced to choose a new password (they can use the "generate random password" button) before anything else works. The password the Admin chose/saw is never stored in plain text, never emailed by the system, never written to logs or audit (the audit row records *that* a password was set, not its value).
3. Unknown emails cannot sign in or sign up: Supabase sign-ups are disabled and a DB trigger rejects any `auth.users` insert that was not provisioned by the server (defence in depth).
4. Before using the CRM every non-seeded user must complete the profile: full name, phone (Egyptian format), residential address, national ID (14 digits, validated).
5. Gate order in middleware: not signed in → `/login`; status `inactive` → `/disabled`; `must_change_password` → `/change-password`; profile incomplete → `/complete-profile`; then role routes.
6. The seeded Super Admin is `active` immediately with `profile_completed = true` (name only) and signs in with email + password. A non-blocking banner asks them to add private data later.

#### 3.3 Authentication & passwords
- **Email + password only.** Login page: email, password, "forgot password".
- **User can change their password at any time** (`/account`): current password + new password, with a **"Generate strong random password"** button that fills the field (shown with copy/show toggles). Changing it signs out the user's other sessions.
- **Forgot password**: email link (Supabase reset). 
- **Admin password actions on a user** (Admin on Sales users; Super Admin on Admin users): *Send reset link*, *Generate random temporary password* (shown once), *Set custom temporary password*. Any Admin-set password sets `must_change_password = true`, revokes all of that user's sessions, and is audited (who/for whom/when — never the value). Admins can never **view** an existing password, only replace it.
- Password policy: min 10 chars (custom or user-chosen); random generator = 16 chars from an unambiguous alphabet (no `0O1lI`), `crypto.getRandomValues` on the server; rate limiting on; leaked-password protection when on Pro.
- The Admin dialog that shows a generated password warns: *"Give it to the employee through a private channel; it won't be shown again."*

#### 3.4 Deactivation
Immediate effect: `profiles.status = 'inactive'` → every RLS policy and RPC checks `is_active_user()`; all sessions revoked (`auth.admin.signOut(userId, 'global')`); active reservations cancelled (products back to `available`); pending price requests rejected ("account deactivated"). Earned `pending`/`approved` commissions **remain payable**. Users with any sales/commissions are never hard-deleted. Re-activation restores role and data.

**Acceptance criteria**
- A sign-up attempt with an unknown email (API or UI) fails; no `auth.users` row is created without server provisioning (DB test).
- A user with `must_change_password = true` can read/write nothing until they set a new password (SQL test with that user's JWT).
- Passwords set or generated by an Admin never appear in logs, audit rows, DB tables or emails (grep + test on audit payloads).
- Deactivated user's existing JWT cannot read or write anything (SQL test).
- Admin cannot modify another Admin; Super Admin cannot be deactivated or demoted by anyone.

---

### 4. Global conventions

- Language: **Arabic RTL only** (no language switcher, no English UI in v1). All strings from `next-intl` messages (`i18n/ar.json`). Tailwind logical utilities only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`).
- Currency: **EGP only**. DB `numeric(12,2)`. Display with `Intl.NumberFormat('ar-EG')` but **Latin digits** (1,234.50). Rounding: half-up to 2 decimals, done in SQL only.
- Time: store `timestamptz` (UTC); display in `Africa/Cairo`; Gregorian dates.
- Codes: full code `GZ-00127` (Admin only) / public code `P-00127` (Sales). See F3.
- **Theme:** Light / Dark / System (default System), toggle in topbar and `/account`, per device, no DB column; tokens in `BRANDING.md`. Print pages always light.
- **Overlays (dialogs, confirm dialogs, drawers, popovers, dropdowns, toasts) are centered/anchored with flex or logical `inset-*` only — never `translate`, `left-*`, `right-*`, `start-1/2`** (they break in RTL and clip on the left). One shared primitive per overlay type, panel `max-h-[90dvh]` scrolling inside, fully inside the viewport at 360 px.
- Confirmation dialogs for destructive/financial actions; loading, empty and error states on every list; toast on success/failure.
- Branding: the logo is supplied (`public/logo.jpg`); palette, typeface, shapes and logo usage are defined in **`BRANDING.md`** (navy `#10324D`, blue `#397AD2`/`#2F67B8`, teal `#4EC1D3`, font Cairo). Never invent, redraw or recolor the logo.

---

### 5. Features

#### F1 — Stores (Admin)
- CRUD: name, `store_code` (2–4 uppercase Latin letters, unique), address, phone, notes, active flag.
- `store_code` is immutable once any product uses the store.
- Hard delete only if no products and no historical sales reference it (`ON DELETE RESTRICT`); otherwise **deactivate**. Deactivated stores disappear from new-product dropdowns but stay visible on historical records.
- A store with `available`/`reserved` products cannot be deactivated until the Admin moves them (UI offers "move products to another store").
- **Store names are never visible to Sales** — not in catalog, details, sales history, CSV, notifications, invoices.

#### F2 — Categories (Admin)
- Two levels only (parent → child), enforced in DB. Seed (Arabic names in migration):
  - الأثاث: كنب، غرف نوم، دواليب، مطابخ، أثاث مكتبي، مكاتب، كراسي، ترابيزات
  - الأجهزة المنزلية: غسالات، ثلاجات
  - أغراض منزلية أخرى
- Admin can add / edit / reorder / deactivate. Same delete rules as stores. Filtering by a parent includes its children.

#### F3 — Products (Admin)
Fields: name, description, category, store, `list_price`, optional `min_price` (Admin-only), commission type + value, status, **media: images (1–10, one primary) and videos (0–3)**, `product_type` (`single` | `set`), created date.

**Codes**
- One **global** sequence. Full code `{store_code}-{00000}` e.g. `GZ-00127`; public code `P-00127`. Both unique, generated in DB by trigger, **immutable** (moving a product to another store keeps the code).
- Components of a set get suffixes `-A`, `-B`… (`GZ-00127-A`, `P-00127-A`).
- Admin search accepts either code (case-insensitive, dash optional). Sales search accepts the public code only.

**Statuses**: `available`, `reserved`, `partially_sold`, `sold`, `inactive`.
- A product is a **single physical piece** (no quantity). Identical items = separate products ("Duplicate product" action).
- New / imported products are created `inactive` and can be activated only when they have **≥ 1 image**. Products without images show a "missing images" badge for Admin and are invisible to Sales. Videos are optional and never count toward activation.
- Hard delete only if never sold and no financial history; otherwise set `inactive`. Deleting removes all its media (images, videos, posters) from Storage.

**Sets (طقم)**
- Sold **as a whole** by default with its own price/commission.
- Optional `allow_piece_sale`. When on, Admin defines components: name, price (mandatory), `min_price` (optional), commission type/value (mandatory — no auto-splitting).
- When one component is sold: set becomes `partially_sold`, whole-set sale is **blocked**, remaining components sell individually; when the last component is sold the set becomes `sold`.
- Locking covers set and component together (no whole-set sale racing a piece sale).

**Media (images AND videos)** — every product is uploaded with photos and videos:
- Per product: **up to 10 images and up to 3 videos**. A single gallery shows both, ordered by the Admin (drag-to-reorder). The **primary** item must be an **image** (it is the catalog card cover). Videos are optional; activation still requires ≥ 1 image.
- **Images**: private bucket `product-images`, JPEG/PNG/WebP, ≤ 5 MB each, client-side resize (max 1600 px, WebP), random names `products/{product_id}/{uuid}.webp`, thumbnails via Storage transformations.
- **Videos**: private bucket `product-videos`, **MP4 / WebM / MOV**, **≤ 50 MB each**, no transcoding in v1. A poster frame (WebP) and the duration are generated in the browser at upload time. Help text tells Admins that iPhone videos should be recorded with "Most Compatible" so they play on every device.
- **Upload**: only Admin. Direct browser-to-Storage upload through a server-issued signed upload URL (with progress bar, multi-file, per-file retry); the server then re-checks the stored object (real size, MIME, magic bytes: MP4/MOV `ftyp`, WebM `1A45DFA3`) before registering it; invalid files are deleted. All reads (Admin and Sales) use server-generated signed URLs (1 h); nothing is public.
- **Display**: catalog cards show the primary image only (videos are never auto-loaded). Product details show the gallery: large viewer + thumbnail strip, videos with controls, `preload="metadata"`, poster, `playsInline`, no autoplay, lazy signed URL, clear Arabic fallback if the browser cannot play the file.
- Deleting a media item (or a product) deletes its Storage objects including the poster. Add/delete/reorder/primary changes are audited.

**Import (Admin)** — `.xlsx` and `.csv`
1. "Download template": columns + a sheet listing valid categories/stores/payment values.
2. Columns: name*, category* (child, or `parent > child`), store* (by name), list_price*, min_price, commission_type, commission_value, description, product_type (default `single`).
3. Server parses (SheetJS), validates with Zod, **dry-run preview** (valid rows / rows with row number + reason). Limits: 500 rows, 2 MB.
4. Save = single RPC `import_products` (all-or-nothing for the valid set chosen), codes auto-generated, status `inactive`, one audit entry (file name + counts). Sets import as a set without components; images and components are added in UI.

**Acceptance criteria**
- Two concurrent sales of the same product: exactly one succeeds (SQL concurrency test).
- Code never changes after store move; both code forms searchable; trigram name search works.
- Media limits enforced in DB and server: an 11th image, a 4th video, or a video > 50 MB is rejected; a renamed non-video file is rejected; Sales can only reach media through signed URLs.
- Sales' API/network responses never contain `store_id`, store name, full code or `min_price` (checked in SECURITY tests).

#### F4 — Reservations (Sales / Admin)
- A Sales user can reserve an `available` product (or component) for **48 h** (setting `reservation_hours`), max **5 active** per user (`max_active_reservations`).
- Others see "reserved" and cannot reserve or sell it. Only the owner can complete the sale.
- Expires automatically (pg_cron every 5 min **and** lazy check inside every RPC). Owner can cancel; Admin can cancel or extend any reservation.
- 6 h before expiry the owner gets a notification.
- A pending price request automatically holds the product (`reason = price_request`) until the decision.

#### F5 — Sales dashboard & catalog (Sales)
Catalog of products that are `available` (and `partially_sold` sets' remaining components), each card: primary image, name, **public** code, category, list price, short description, **estimated** commission / bonus / total (computed at list price, labeled "تقديري"). **No store name, no store filter.**
Search (name / public code), filters (category incl. children, price range), sort, product details page (media gallery with images and videos, description, components), actions: Reserve, **Add to sale** (basket).
Live updates when a colleague reserves/sells (Realtime Broadcast from DB trigger on a private channel carrying only public code + status; fallback polling 30 s).

#### F6 — Registering a sale: multi-product basket (Sales)
One sale (one customer visit) can contain **1–10 items** (products, or components of a set). One invoice, one customer record, one payment/installment plan per sale; **commission and bonus are snapshotted per item**.

Flow: catalog → **Add to sale** (basket at `/sales/cart`) → customer data → item prices → review earnings → submit. The basket holds only public codes (client-side, per user, no money data); everything is re-validated on submit.
- Customer (stored on the sale, no `customers` table in v1): name*, phone*, address, notes, payment method* (from `payment_methods` setting: cash, transfer, installments…), optional delivery (see F18).
- Every item must be `available` or reserved by the same user; each item follows the F4 reservation rules (cap of 5 active reservations applies to held items, not to items added to a basket directly).
- **Item price**: defaults to `list_price`; with `min_price` the user may enter any price ≥ `min_price`. Below it → server rejects naming the item (**never revealing the limit**) and offers **Request approval for that item** (per-item price request, holds the unit; the basket can still be submitted once approved).
- **Negotiated total**: the user may type the agreed basket total; the UI proposes item prices by distributing the difference **proportionally to list prices**, rounded to whole EGP, with the rounding remainder added to the highest-priced item so the item prices sum exactly to the agreed total (shared pure function `distributeTotal`, unit-tested). The user can edit any item price. **Prices are always saved per item**; there is no invoice-level discount. Each item is checked against its own `min_price`.
- Read-only RPC `preview_sale_earnings(items)` returns, per item, base commission + each bonus line, and the basket total (shows when a bonus disappears because an item price left its range). Same code path as the real sale.
- `complete_sale(items, customer, payment_method, delivery)` — one transaction, **all-or-nothing**: lock every unit (products + sets/components) in a fixed order, verify active user, reservation ownership/availability, price rules per item, set statuses, insert `sales` + `sale_items`, snapshot commission + bonus lines per item, close reservations, audit, notify.
- After the sale: Sales can print the **invoice** (items with prices after discount, total, delivery status; no commission/store/min_price/full codes).

**Editing after sale**: money fields (items, prices, commission, bonus, seller, time) are immutable; fix by Admin cancelling an item/sale (F11) and re-registering. Customer name/phone/address/notes/payment method can be corrected by the seller while **all** the sale's commissions are `pending`, and by Admin afterwards; every edit is audited. Sales can click **"Request correction"** (note → notification to Admins). No deletion of sales, ever.

#### F7 — Sales history & earnings (Sales)
Own sales only: date, items (public codes, price each), customer, total, payment status, delivery status, per-item commission status (pending / approved / paid / cancelled), base + bonus + total per item and per sale. Commissions waiting for customer payment show "بانتظار تحصيل العميل". CSV export of own sales. Dashboard KPIs: products sold, revenue, earned commission, earned bonus, pending / approved / paid, recent sales, performance over time. **No leaderboard / peer comparison. No profit margin, store, or min_price.**

#### F8 — Commissions (Admin)
- Per product (and per component): `commission_type` (`percentage` | `fixed`) + `commission_value` stored on the row. Percentage ∈ [0,100], fixed ≥ 0 (capped at sale price when applied).
- New products take defaults from settings (`default_commission_type/value`, initially 0%).
- **Bulk update**: filters (store, category incl. children, price range min/max, status, search) + manual selection (all matching or ticked) → apply type/value. It is a **static write at execution time**; later products are unaffected.
- Every bulk run is logged in `commission_rules` (+ `commission_rule_items` with old values) → **Undo** restores old values only for items still equal to what the batch set (others reported as skipped).
- Sales' catalog reflects changes immediately.
- Calculation base: `sale_price` for percentage; fixed stays fixed.

#### F9 — Bonuses (Admin)
`bonus_rules`: name, type (`percentage` of sale price | `fixed`), value, scope, optional start/end (temporary promos), active flag. Scope dimensions (all optional, **AND across dimensions, OR within one**): specific products, categories, stores, price range `[min,max]` **evaluated on the actual sale price**. At least one scope dimension or a price range is required.
- Create / edit / activate / deactivate; multiple rows stacked.
- All applicable active rules at the sale timestamp **stack**. Optional global caps (`bonus_cap_amount`, `bonus_cap_percent_of_price`, Super Admin only; the stricter applies).
- Each applied rule is snapshotted as a row in `commission_bonuses` (rule name, type, value, amount). Editing a rule never changes past sales.
- Sales UI shows base commission, bonus (per line on details), total expected earnings.

#### F10 — Customer payments & installments (Admin records)
- Each sale has `total_price` (sum of its **active** items); `payment_status` is **computed**: `unpaid` | `partial` | `paid`.
- Admin records payments in `sale_payments` (**append-only**): `payment` or `refund`, amount > 0, date ≤ today, method, note. Net paid can never exceed `sale_price` or go below 0. Corrections = a reversing `refund`, with mandatory reason. Each row gets a sequential receipt number `RC-000123`.
- **Installment plan (optional)**: Admin defines rows in `sale_installments` (seq, due_date, amount; a down payment is row 0 due on sale date). Sum of rows must equal `sale_price`. Payments are **not** tied to a row; installment status (`paid` / `partial` / `overdue` / `upcoming`) is **computed FIFO** from cumulative net payments. Rescheduling unpaid rows requires a reason (audited). If an item is cancelled the total changes and the plan is flagged **needs review** (shown in the approvals inbox) until the Admin reschedules it.
- Overdue installments appear in the Admin approvals inbox (count + list: customer, amount, days late) and a notification on the due date. No late fees, no customer reminders (SMS/WhatsApp) in v1.
- Sales see payment status and the installment schedule of **their own** sales, read-only, no notifications.
- If a sale with payments is cancelled, Admin records the customer refund as a `refund` payment.

#### F11 — Commission lifecycle (Admin)
`pending` → `approved` → `paid`; side states `cancelled` and `clawback`.
1. `complete_sale` creates the commission (`pending`) with immutable snapshot: type, value, base amount, bonus lines, total.
2. **Approve**: Admin approves one or many `pending` commissions. RPC refuses unless the sale is fully `paid`; override allowed with a **mandatory reason** (audited). No auto-approval.
3. **Pay**: Admin records a payout for one employee covering **all** their `approved` commissions (and clawbacks) → `commission_payments` row; included commissions become `paid`. A commission can belong to exactly one payout (unique/locked); duplicate payment impossible. Net payout must be ≥ 0 (negative balances carry forward).
4. **Cancel an item or a whole sale** (Admin only, mandatory reason; item = one product/component of the basket): the unit returns to `available` (or `inactive` if damaged); the item's `pending`/`approved` commission + bonuses → `cancelled`; if already `paid` → a **clawback** row (negative amount, `approved`) is created and deducted automatically from the employee's next payout. Paid rows are never edited or deleted. The sale `total_price` is recalculated from its remaining active items; if the customer has already paid **more than the new total**, the cancel action must include a customer **refund** for the excess (recorded atomically as a `refund` payment); the installment plan is flagged for review. When the last active item is cancelled the whole sale becomes `cancelled`. Cancelling a whole sale cancels all its active items in one transaction.
5. Employees see their own statuses; Admin sees all with filters and CSV export (payables per employee per period).

#### F12 — Admin dashboard & reports
KPIs: total / available / reserved / sold products, stores, admins, sales employees, completed sales, revenue, total commissions, total bonuses. Charts: sales over time, by store, by category, top products, employee performance, commission distribution. Filters: date presets + custom, store, employee, category. All numbers from SQL views/RPCs (`admin_dashboard_stats`); cancelled sales excluded everywhere via one shared definition.
CSV exports (UTF-8 with BOM): sales, commission payables per employee/period, inventory with statuses, audit log, overdue installments, undelivered/late deliveries. Sales can export only their own sales. No PDF/Excel exports in v1.

#### F13 — Notifications & approvals inbox
- **Admin**: bell + `/admin/approvals` listing counts and actions for: price requests, pending commissions awaiting approval, overdue installments, installment plans needing review, late or paid-but-undelivered sales, correction requests. Counts come from live queries on source tables (no separate table).
- **Sales**: `notifications` table + Realtime: price decision, commission approved/paid, sale cancelled, reservation expiring, correction handled.
- Email only for Supabase Auth messages (invitation link, password reset). Passwords are never sent by email. No WhatsApp/SMS.

#### F14 — User management (Admin)
List with registration date, role, status (`active` / `inactive`), last sign-in; **Add user** (Admin accounts by Super Admin only, Sales by Admin) with the three access options of §3.2; edit info; change role (Super Admin for Admin roles); activate/deactivate; password actions of §3.3 (send reset link / generate random temporary password / set custom temporary password); view masked national ID (reveal button decrypts server-side and **logs an audit entry**). Sales never see anyone else.

#### F15 — Receipts & invoices
Browser-print pages (A4 + optional receipt-roll CSS) with logo and company data from settings. Payment receipt `RC-######` per payment/refund (Admin). Sale invoice `INV-######` per sale (Admin and the selling Sales user; **without** commission/store/min_price). Generated from stored data; cancelled sales show a "ملغاة" mark. No VAT / e-invoice in v1.

#### F16 — Settings (`app_settings`)
`reservation_hours` (48), `max_active_reservations` (5), `default_commission_type/value` (percentage, 0) and `bonus_cap_amount`, `bonus_cap_percent_of_price` (**Super Admin only**), company name/address/phone/footer text, `receipt_prefix` (RC), `invoice_prefix` (INV), `payment_methods` list. Every change audited (old/new).

#### F17 — Audit log
Append-only (no UPDATE/DELETE for any role incl. service role from the app). Written by DB triggers and inside RPCs, never by the frontend. Columns: actor, action, entity type/id, old/new JSON, reason, IP (from request headers, passed to RPC), timestamp, `visibility` (`operational` | `restricted`).
Logged: user/role/status changes, national-ID edits and reveals, product/store/category CRUD and moves, price/min_price changes, bulk commission + undo, bonus rule changes, approvals, payouts, sale cancellations, clawbacks, customer payments/refunds/reschedules, price decisions, settings changes, failed/denied access attempts, imports.
Super Admin sees everything; Admin sees `operational` only (not admin-management or security events); Sales see nothing. Filters: actor, action, entity, date; CSV export.

#### F18 — Delivery tracking (Admin manages, Sales read-only)
- Each sale has `delivery_status`: `pending` (default) / `scheduled` / `delivered` / `pickup` (customer collects), plus `delivery_date` (planned), `delivery_address` (defaults to the customer address), `delivery_notes`, and `delivered_at` (set when marked delivered).
- Admin updates it from the sale page and from `/admin/deliveries` (list with filters: status, date range, late). Sales see the delivery status of **their own** sales (read-only) and get a notification when it changes. It is printed on the invoice.
- Reports in the approvals inbox: **late deliveries** (scheduled date passed, not delivered) and **paid but undelivered** sales.
- **Not linked to commission approval** (that depends only on customer payment, F11). No delivery fees, drivers or route planning in v1; transport costs, if any, go in the notes.
- Every delivery change is audited. Cancelled sales hide delivery data.

---

### 6. Route map

```
(auth)     /login  /forgot-password  /reset-password  /change-password  /disabled  /complete-profile
(account)  /account            (profile, change/set password)
(admin)    /admin/dashboard  /admin/approvals
           /admin/products  /admin/products/new  /admin/products/[id]  /admin/products/import
           /admin/stores  /admin/categories
           /admin/sales  /admin/sales/[id]            (items, payments, installments, delivery, cancel item/sale)
           /admin/deliveries
           /admin/commissions  (tabs: pending | approved | paid)  /admin/commissions/bulk
           /admin/payouts  /admin/bonuses
           /admin/users  /admin/reports  /admin/audit  /admin/settings
(sales)    /sales/dashboard  /sales/catalog  /sales/catalog/[publicCode]
           /sales/cart  /sales/reservations  /sales/my-sales  /sales/my-earnings
(print)    /print/invoice/[saleId]  /print/receipt/[paymentId]
```

### 7. Non-functional requirements
- Responsive down to 360 px; tables become cards on mobile; touch targets ≥ 44 px.
- Lists paginated server-side; dashboards < 2 s on 10k sales; indexes per `DATABASE.md`.
- Accessibility: keyboard navigation, focus states, labels, contrast AA.
- Errors never leak internals; all server actions return `{ ok, data | error }` with Arabic messages.

### 8. Testing requirements (summary; details in `BUILD_PLAN.md`)
pgTAP/SQL tests for RLS and RPCs (concurrent sales, Sales data isolation, deactivated JWT, duplicate payout), Vitest for validators (national ID, Zod schemas), Playwright for: Admin creates user (invite / random password / custom password) → login → forced password change → profile gate; reserve → sell → approve → pay; price request flow; import flow.

### 9. Deployment
Two Supabase projects (`dev`, `prod`), Vercel Preview → dev, Production → prod. Migrations only via Supabase CLI in Git. Secrets in Vercel env only. See `SETUP.md`.

### 10. Data the owner must supply
Receipt details (address, phone, footer text; company name = «تجديد», logo already supplied), production domain, Super Admin password (entered by the owner in the environment, never in code), Supabase/Vercel/GitHub accounts.

### 11. Out of scope (v1)
Multi-currency, English UI, customers table / repeat-customer tracking, VAT & e-invoicing, late fees, customer SMS/WhatsApp/email reminders, PDF/Excel report export, peer leaderboard, per-store restriction for Sales, auto-approval of commissions, purchase-cost / profit tracking (the company only displays and sells, it does not buy), settlements with store owners or consignors (handled outside the system), delivery fees / drivers / route planning, invoice-level discounts (discounts are per item).

### 12. Assumptions to confirm before building
1. Seeded Super Admin is exempt from the blocking profile-completion gate (they asked for full access immediately); a banner requests their private data.
2. Invoices are issued by Admin or the seller; customers do not log in.
3. Imported/new products stay `inactive` until an image exists and an Admin activates them (videos are optional).
4. Components of a set are limited to 26 (suffix A–Z).
5. The price-approval grant lasts as long as the reservation hold (48 h by default).
6. A negotiated basket total may be higher or lower than the sum of list prices; the proportional distribution works in both directions and each item is still validated against its own `min_price`.
7. Reservation cap (5) counts held reservations only; items added directly to a basket from `available` stock do not need a reservation but are locked at submit.

---



<!-- ===== BRANDING.md ===== -->

# PART 2. Branding & dark mode

## BRANDING — تجديد (Tajdeed)

Company: **تجديد — لأدوات منزلية مستعملة** (used household goods).
Logo files (already in this pack): `public/logo.jpg` (cleaned crop, white background) and `public/logo-original.jpg`.
**Never redraw, recolor, stretch or replace the logo.** Use it as-is, with clear space ≥ the height of the "ت" letter on all sides.

> The logo is a JPG (no transparency). It must sit on **white** or the very light tint `#F7FDFD`. When the owner supplies an SVG/PNG with a transparent background, replace `public/logo.jpg` and keep the same imports (`/logo.svg` preferred). On dark surfaces (sidebar) do **not** place the JPG directly; use a white rounded "badge" container behind it.

### Palette (sampled from the logo)
| Token | Hex | Use |
|---|---|---|
| `brand-navy` | `#10324D` | Headings, body text on light, sidebar background |
| `brand-blue` | `#397AD2` | Logo blue, charts, decorative accents (NOT for white text, contrast 4.3:1) |
| `brand-blue-600` | `#2F67B8` | **Primary buttons/links** (white text contrast 5.6:1, AA) |
| `brand-blue-700` | `#2A5CA8` | Primary hover/pressed (6.6:1) |
| `brand-teal` | `#4EC1D3` | Secondary accent, active indicators, chart series 2 |
| `brand-cyan` | `#7EDAE4` | Soft highlights, chart series 3 |
| `brand-tint` | `#E8F6F9` | Subtle backgrounds, hover rows, selected states |
| `surface` | `#F7FDFD` | App background |
| `white` | `#FFFFFF` | Cards, inputs |

Semantic colors (not in logo; keep soft and consistent): success `#16A34A`, warning `#D97706`, danger `#DC2626`, info = brand-blue-600. Status badges: available = success, reserved = warning, partially_sold = brand-teal, sold = brand-navy, inactive = gray.

Chart palette (in order): `#397AD2`, `#4EC1D3`, `#10324D`, `#7EDAE4`, `#2F67B8`, `#94A3B8`.

### Tailwind tokens (put in `tailwind.config.ts` → `theme.extend.colors`)
```ts
brand: {
  navy: '#10324D', blue: '#397AD2', 'blue-600': '#2F67B8', 'blue-700': '#2A5CA8',
  teal: '#4EC1D3', cyan: '#7EDAE4', tint: '#E8F6F9', surface: '#F7FDFD',
}
```
Also expose them as CSS variables for shadcn-style components (`--primary: 213 60% 46%` etc.).

### Typography
- Arabic UI font: **Cairo** (matches the rounded, friendly geometry of the logotype) via `next/font/google`, weights 400/500/600/700. Fallback: `system-ui, 'Segoe UI', Tahoma, sans-serif`.
- Numbers in Latin digits (see PRD §4); use `tabular-nums` in tables.
- Base size 16 px (15 px in dense tables), headings navy, line-height 1.6 for Arabic.

### Shape & feel
- Radius: 12 px cards/inputs, 9999 px badges, 10 px buttons. Soft shadows (`0 1px 2px rgba(16,50,77,.06), 0 4px 16px rgba(16,50,77,.06)`).
- Friendly, clean, high-whitespace commercial look; blue/teal gradients only for the login hero and empty-state illustrations (subtle).
- Icons: `lucide-react` (mirror directional icons in RTL). Empty states may reuse the house/recycle motif **only via the logo asset**, not redrawn.

### Where the logo appears
1. Login / forgot / pending / complete-profile pages (centered, ~160 px wide).
2. Sidebar top (inside a white rounded badge on the navy sidebar; collapsed state shows a cropped crown/house mark via CSS `object-position`, no redraw).
3. Browser favicon / PWA icon: crop the crown+house mark from `logo.jpg` into square PNGs (32/180/512) with `sharp` at build time or a one-off script committed to `public/`.
4. Print pages (invoice, receipt): header with logo (~120 px) + company name + address/phone from Settings.
5. Email templates (Supabase invite/reset): logo hosted from the production domain (`/logo.jpg`).

### Brand text
- App name: **تجديد** (title tag pattern: `الصفحة | تجديد`). Tagline: **لأدوات منزلية مستعملة**.
- Default `company_name` setting = `تجديد`; `company_footer` suggestion: `شكراً لثقتكم في تجديد`.

### Dark mode (required)
- Options **Light / Dark / System** (default System), toggle in the topbar and on `/account`, stored per device with `next-themes` (`attribute="class"`, `storageKey="tajdeed-theme"`, `disableTransitionOnChange`, `suppressHydrationWarning` on `<html>`), no DB column. Tailwind `darkMode: 'class'`; `color-scheme: dark` on `.dark`.
- **Components use semantic tokens only** (`bg-background`, `bg-surface`, `bg-surface-2`, `border-border`, `text-foreground`, `text-muted`, `bg-primary`, `text-link` …). No hard-coded `bg-white`, `text-gray-*`, `bg-slate-*` or raw hex inside components (allowed only in the token definitions and in print pages).

| Token | Light | Dark |
|---|---|---|
| background | `#F7FDFD` | `#0B1B2B` |
| surface (cards, dialogs, inputs) | `#FFFFFF` | `#11273B` |
| surface-2 (hover, stripes) | `#E8F6F9` | `#16324A` |
| border | `#D5E6EC` | `#24425C` |
| foreground | `#10324D` | `#E6EEF5` |
| muted | `#5B7184` | `#9FB3C5` |
| sidebar | `#10324D` | `#08141F` |
| primary (buttons, white text) | `#2F67B8` | `#2F67B8` |
| primary hover | `#2A5CA8` | `#3B77CC` |
| link / accent text | `#2F67B8` | `#7FB0F5` |
| accent teal | `#4EC1D3` | `#4EC1D3` |
| success / warning / danger text | `#16A34A / #B45309 / #DC2626` | `#4ADE80 / #FBBF24 / #F87171` |

Dark pairs were checked for WCAG AA (foreground on surface 13:1, muted on surface 7:1, link on surface 6.9:1, white on primary 5.6:1). Keep ≥ 4.5:1 for text and ≥ 3:1 for UI boundaries/focus rings in both themes (verify with `axe`).
- **Logo** (white-background JPG): always inside a white rounded badge in dark mode (sidebar, login, topbar); never inverted/filtered. **Print pages (invoice, receipt) are always light.** Product photos/videos are never filtered.
- Charts, badges, toasts, skeletons, empty states, tables (header/stripe/hover), inputs (focus ring, disabled, placeholder), dialogs/backdrop (`bg-black/60` in dark), dropdowns and scrollbars are all themed.

---



<!-- ===== DATABASE.md ===== -->

# PART 3. Database

## DATABASE — Supabase PostgreSQL schema, RLS and RPC specification

Rules for every migration (create tables in dependency order exactly as listed in this document; the SQL blocks here were executed successfully on PostgreSQL 16 with stub `auth.users`):
- Files in `supabase/migrations/NNNN_name.sql`, applied with `supabase db push` to `dev` first, then `prod`. **No manual schema edits in the dashboard.**
- All PKs `uuid default gen_random_uuid()`; all tables have `created_at timestamptz default now()`; mutable ones have `updated_at` (trigger).
- Money = `numeric(12,2)` with `CHECK`s. No float. Rounding half-up in SQL (`round(x, 2)`).
- **No `ON DELETE CASCADE` on anything financial.** Use `RESTRICT`.
- RLS **enabled on every table** in `public`. Default deny. Types generated with `supabase gen types typescript`.
- Every `SECURITY DEFINER` function: `SET search_path = ''`, fully-qualified names, `REVOKE ALL ... FROM public, anon`, `GRANT EXECUTE` only to `authenticated`, and starts with `perform private.assert_active_user();`.
- Extensions: `pgcrypto`, `citext`, `pg_trgm`, `pg_cron`.

### 1. Enums

```sql
create type app_role            as enum ('admin','sales');
create type account_status      as enum ('active','inactive');
create type product_type        as enum ('single','set');
create type product_status      as enum ('available','reserved','partially_sold','sold','inactive');
create type commission_type     as enum ('percentage','fixed');
create type commission_status   as enum ('pending','approved','paid','cancelled');
create type commission_kind     as enum ('earning','clawback');
create type sale_status         as enum ('completed','cancelled');
create type payment_kind        as enum ('payment','refund');
create type reservation_status  as enum ('active','expired','cancelled','converted');
create type reservation_reason  as enum ('manual','price_request');
create type price_request_status as enum ('pending','approved','rejected','cancelled','expired','used');
create type bonus_type          as enum ('percentage','fixed');
create type delivery_status     as enum ('pending','scheduled','delivered','pickup');
create type sale_item_status    as enum ('active','cancelled');
create type audit_visibility    as enum ('operational','restricted');
```

### 2. Tables

#### 2.1 Identity

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email citext not null unique,
  full_name text,
  status account_status not null default 'active',
  must_change_password boolean not null default false,   -- true after an Admin sets/generates a password
  is_super_admin boolean not null default false,
  profile_completed boolean not null default false,
  created_by uuid references profiles(id),                -- the Admin who provisioned the account
  deactivated_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_super_admin on profiles (is_super_admin) where is_super_admin;

create table user_roles (
  user_id uuid primary key references profiles(id) on delete restrict,
  role app_role not null,
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now()
);
-- trigger: is_super_admin => role must be 'admin'; super admin role/status immutable;
-- cannot deactivate/demote the last active admin.

create table employee_private_data (
  user_id uuid primary key references profiles(id) on delete restrict,
  phone text not null check (phone ~ '^(\+20|0)1[0125][0-9]{8}$'),
  address text not null check (length(address) between 5 and 500),
  national_id_encrypted text not null,       -- AES-256-GCM (iv.tag.ciphertext, base64) done in app server
  national_id_hash text not null unique,     -- HMAC-SHA256 (separate key) for duplicate detection
  national_id_masked text not null,          -- e.g. '29**********34'  (first 2 + last 2) for display
  updated_at timestamptz not null default now()
);

```

**Provisioning (no self sign-up).** Supabase Auth sign-ups are disabled. Server actions (service role, after an Admin/Super Admin check) first insert a row in `account_provisions`, then create the Auth user with `auth.admin.createUser({ email, password, email_confirm: true })` (random / custom password options) or `auth.admin.inviteUserByEmail(email)` (invitation-link option). If the Auth call fails, the provision row is removed. `account_provisions` has RLS enabled and **no policies** (service role / RPC only), so no client can forge one.

```sql
create table account_provisions (
  email citext primary key,
  role app_role not null,
  must_change_password boolean not null,          -- true for random/custom Admin-set passwords; false for invitation links
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
```

`handle_new_user()` trigger on `auth.users` insert: **raises an exception unless an unconsumed `account_provisions` row exists for the new user's email** (blocks any other signup path even if sign-ups get enabled by mistake). Otherwise it creates the `profiles` row (`status='active'`, `must_change_password` and `created_by` copied from the provision) and the `user_roles` row, and sets `consumed_at`. The seeded Super Admin is created by the seed script (service role) with a provision row, then `is_super_admin=true`, `profile_completed=true`, `must_change_password=false`. Admin-vs-Super-Admin rules (a regular Admin cannot create `admin` users) are enforced in the server action **and** re-checked in the RPC that writes the provision.

`private.is_active_user()` returns true only if `profiles.status='active'` **and** `must_change_password=false`. The single RPC allowed while the flag is true is `complete_password_change()` (called by the server action right after `auth.updateUser({ password })` succeeds; it clears the flag and audits `user.password_changed`).

#### 2.2 Catalog

```sql
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  store_code text not null unique check (store_code ~ '^[A-Z]{2,4}$'),
  address text, phone text, notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- trigger: store_code immutable once any product references the store.

create table categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  slug text not null unique,
  parent_id uuid references categories(id) on delete restrict,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- trigger: max depth 2 (a category whose parent has a parent is rejected).

create sequence product_seq;

create table products (
  id uuid primary key default gen_random_uuid(),
  seq_no bigint not null unique default nextval('product_seq'),
  code text not null unique,            -- 'GZ-00127' (ADMIN ONLY)
  public_code text not null unique,     -- 'P-00127'
  name text not null,
  description text,
  category_id uuid not null references categories(id) on delete restrict,
  store_id uuid not null references stores(id) on delete restrict,
  product_type product_type not null default 'single',
  allow_piece_sale boolean not null default false,
  status product_status not null default 'inactive',
  list_price numeric(12,2) not null check (list_price > 0),
  min_price numeric(12,2) check (min_price is null or (min_price > 0 and min_price <= list_price)),
  commission_type commission_type not null default 'percentage',
  commission_value numeric(12,2) not null default 0 check (commission_value >= 0),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (commission_type <> 'percentage' or commission_value <= 100),
  check (product_type = 'set' or allow_piece_sale = false)
);
create index products_status_idx   on products (status);
create index products_store_idx    on products (store_id);
create index products_category_idx  on products (category_id);
create index products_price_idx    on products (list_price);
create index products_name_trgm    on products using gin (name gin_trgm_ops);
create index products_code_trgm    on products using gin (code gin_trgm_ops);
-- BEFORE INSERT trigger: code := store_code || '-' || lpad(seq_no::text,5,'0'); public_code := 'P-' || lpad(seq_no::text,5,'0');
-- BEFORE UPDATE trigger: code/public_code/seq_no immutable.
-- trigger: status can become 'available' only if >=1 product_media row with kind='image' exists (videos don't count).

create table product_components (            -- only for sets with allow_piece_sale
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  suffix char(1) not null check (suffix ~ '^[A-Z]$'),
  name text not null,
  status product_status not null default 'available' check (status in ('available','reserved','sold','inactive')),
  list_price numeric(12,2) not null check (list_price > 0),
  min_price numeric(12,2) check (min_price is null or (min_price > 0 and min_price <= list_price)),
  commission_type commission_type not null,
  commission_value numeric(12,2) not null check (commission_value >= 0),
  unique (product_id, suffix)
);
-- full component code = products.code || '-' || suffix ; public = products.public_code || '-' || suffix

create type media_kind as enum ('image','video');

create table product_media (                 -- images AND videos of a product
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  kind media_kind not null,
  storage_path text not null unique,         -- bucket is implied by kind: product-images | product-videos
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds numeric(8,2),             -- videos only (informational)
  poster_path text,                          -- videos only: WebP in product-images bucket
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (kind = 'image' or is_primary = false),                                   -- primary must be an image
  check (kind = 'image' and mime_type in ('image/jpeg','image/png','image/webp')
      or kind = 'video' and mime_type in ('video/mp4','video/webm','video/quicktime')),
  check (kind = 'image' and size_bytes <= 5242880 or kind = 'video' and size_bytes <= 52428800)
);
create unique index one_primary_media on product_media (product_id) where is_primary;
create index product_media_product on product_media (product_id, sort_order);
-- triggers: max 10 images and max 3 videos per product; deleting a row must also delete its Storage objects
-- (done by the server action; a nightly job reports orphaned objects).
```

#### 2.3 Reservations & price requests

```sql
create table reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  component_id uuid references product_components(id) on delete restrict,
  user_id uuid not null references profiles(id),
  reason reservation_reason not null default 'manual',
  status reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
-- one active reservation per sellable unit:
create unique index one_active_reservation_product   on reservations (product_id)   where status='active' and component_id is null;
create unique index one_active_reservation_component on reservations (component_id) where status='active' and component_id is not null;

create table price_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  component_id uuid references product_components(id) on delete restrict,
  requested_by uuid not null references profiles(id),
  requested_price numeric(12,2) not null check (requested_price > 0),
  note text,
  status price_request_status not null default 'pending',
  approved_price numeric(12,2),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
```

#### 2.4 Sales

```sql
create sequence invoice_seq;

create table sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,                  -- prefix from settings + lpad(nextval('invoice_seq'),6,'0')
  seller_id uuid not null references profiles(id),
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null,
  customer_address text,
  notes text,
  payment_method text not null,                     -- value from settings.payment_methods
  delivery_status delivery_status not null default 'pending',
  delivery_date date,                               -- planned date
  delivery_address text,                            -- defaults to customer_address
  delivery_notes text,
  delivered_at timestamptz,
  installments_need_review boolean not null default false,  -- set when an item cancellation changes total_price
  total_list_price numeric(12,2) not null,          -- sum of ACTIVE items' list prices (maintained by RPCs)
  total_price numeric(12,2) not null check (total_price >= 0),   -- sum of ACTIVE items' sale prices; 0 only when the sale is cancelled
  status sale_status not null default 'completed',
  sold_at timestamptz not null default now(),
  cancelled_by uuid references profiles(id),
  cancelled_at timestamptz,
  cancel_reason text,
  check (status = 'completed' or (cancel_reason is not null and cancelled_by is not null))
);
create index sales_seller_idx on sales (seller_id, sold_at desc);
create index sales_sold_at_idx on sales (sold_at desc);

create table sale_items (                           -- 1 to 10 items per sale (basket); enforced in complete_sale + trigger
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  component_id uuid references product_components(id) on delete restrict,
  store_id uuid not null references stores(id),     -- snapshot (ADMIN ONLY)
  category_id uuid not null references categories(id),
  list_price numeric(12,2) not null,
  sale_price numeric(12,2) not null check (sale_price > 0),
  status sale_item_status not null default 'active',
  cancelled_by uuid references profiles(id), cancelled_at timestamptz, cancel_reason text,
  is_live boolean not null default true,            -- false when the item is cancelled; releases the unit
  check (status = 'active' or (cancel_reason is not null and cancelled_by is not null and is_live = false))
);
-- a sellable unit (product, or component) can be live in at most one sale:
create unique index sale_items_live_product   on sale_items (product_id)   where is_live and component_id is null;
create unique index sale_items_live_component on sale_items (component_id) where is_live and component_id is not null;
```

A sale's `sale_price` per item lives in `sale_items`; `sales.total_price` is always `sum(sale_items.sale_price) where status='active'` (updated only by the RPCs; a trigger re-checks it). The sale `status` becomes `cancelled` when its last active item is cancelled. Payment status, installments and invoice all work on `sales.total_price`.

`complete_sale` still takes row locks first; the partial unique indexes are the last line of defence against double sales. `cancel_sale` sets `is_live = false`.

#### 2.5 Commissions, bonuses, payouts

```sql
create table commission_payments (              -- payouts to employees
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  paid_at date not null,
  method text not null,
  note text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table commissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete restrict,
  sale_item_id uuid not null references sale_items(id) on delete restrict,
  user_id uuid not null references profiles(id),
  kind commission_kind not null default 'earning',
  status commission_status not null default 'pending',
  base_type commission_type,                      -- snapshot
  base_value numeric(12,2),                       -- snapshot (rate or fixed)
  base_amount numeric(12,2) not null default 0,
  bonus_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null,            -- = base + bonus ; negative for clawback
  original_commission_id uuid references commissions(id),  -- for clawback
  payment_id uuid references commission_payments(id) on delete restrict,
  approved_by uuid references profiles(id), approved_at timestamptz,
  approval_override_reason text,                  -- set when approved before full customer payment
  created_at timestamptz not null default now(),
  check ((kind = 'earning' and total_amount >= 0) or (kind = 'clawback' and total_amount < 0 and original_commission_id is not null)),
  check ((status = 'paid') = (payment_id is not null))
);
create unique index one_earning_per_item on commissions (sale_item_id) where kind='earning';
create unique index one_clawback_per_original on commissions (original_commission_id) where kind='clawback';
create index commissions_user_status on commissions (user_id, status);

create table commission_bonuses (                 -- snapshot of every applied bonus rule
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references commissions(id) on delete restrict,
  bonus_rule_id uuid,                              -- FK added below, after bonus_rules exists
  rule_name text not null,
  bonus_type bonus_type not null,
  bonus_value numeric(12,2) not null,
  amount numeric(12,2) not null check (amount >= 0)
);
```

#### 2.6 Rules (commission batches + bonus rules)

```sql
create table commission_rules (                   -- LOG of bulk updates (not a live rule engine)
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id),
  filters jsonb not null,
  new_type commission_type not null,
  new_value numeric(12,2) not null,
  affected_count int not null,
  undone_at timestamptz, undone_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table commission_rule_items (
  rule_id uuid not null references commission_rules(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  component_id uuid references product_components(id) on delete restrict,
  old_type commission_type not null, old_value numeric(12,2) not null
);

create table bonus_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bonus_type bonus_type not null,
  bonus_value numeric(12,2) not null check (bonus_value > 0),
  price_min numeric(12,2), price_max numeric(12,2),
  starts_at timestamptz, ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (price_max is null or price_min is null or price_max >= price_min),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (bonus_type <> 'percentage' or bonus_value <= 100)
);
create table bonus_rule_products   (rule_id uuid references bonus_rules(id) on delete cascade, product_id uuid references products(id) on delete cascade, primary key(rule_id, product_id));
create table bonus_rule_categories (rule_id uuid references bonus_rules(id) on delete cascade, category_id uuid references categories(id) on delete cascade, primary key(rule_id, category_id));
create table bonus_rule_stores     (rule_id uuid references bonus_rules(id) on delete cascade, store_id uuid references stores(id) on delete cascade, primary key(rule_id, store_id));
alter table commission_bonuses
  add constraint commission_bonuses_rule_fk foreign key (bonus_rule_id) references bonus_rules(id) on delete set null;
-- (cascade is acceptable ONLY on these scope junctions; they hold no financial history — snapshots live in commission_bonuses)
```

**Bonus matching (function `private.applicable_bonus_rules(product, component, sale_price, at)`)**: rule is active, `at` within `[starts_at, ends_at]` (nulls open), price within `[price_min, price_max]`, and for each scope dimension that has rows → the product's product/category (incl. parent)/store must be in it. At least one scope dimension or a price bound must exist (validated on write).

**Earnings calculation (`private.calc_earnings(product, component, sale_price, at)`)** returns `(base_type, base_value, base_amount, bonus_lines jsonb, bonus_amount, total)`:
1. base = percentage → `round(sale_price * value/100, 2)`; fixed → `least(value, sale_price)`.
2. each matching bonus: percentage → `round(sale_price*value/100,2)`; fixed → value.
3. bonus_amount = sum; apply caps from settings (`bonus_cap_amount`, `bonus_cap_percent_of_price`; stricter wins; scale lines proportionally and record capped amounts).
4. total = base + bonus.

#### 2.7 Customer payments & installments

```sql
create sequence receipt_seq;

create table sale_payments (                     -- APPEND-ONLY
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete restrict,
  kind payment_kind not null default 'payment',
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null,                          -- must be <= today (Africa/Cairo): enforced in record_sale_payment (CHECK cannot use now())
  method text not null,
  note text,
  reason text,                                   -- required when kind='refund'
  receipt_no text not null unique,               -- prefix + lpad(nextval('receipt_seq'),6,'0')
  recorded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  check (kind = 'payment' or reason is not null)
);

create table sale_installments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete restrict,
  seq int not null check (seq >= 0),             -- 0 = down payment (due on sale date)
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  superseded_at timestamptz                      -- set on reschedule; old row kept for history
);
create unique index sale_installments_active_seq on sale_installments (sale_id, seq) where superseded_at is null;
```

Views (security definer, filtered by role, see section 4):
- `sale_payment_summary` → per sale: `net_paid = sum(payment) - sum(refund)`, `balance = total_price - net_paid`, `payment_status` (`unpaid` if 0, `paid` if balance = 0, else `partial`).
- `installment_status` → for non-superseded rows ordered by `seq`: allocate `net_paid` FIFO; status `paid` | `partial` | `overdue` (due_date < today and not fully covered) | `upcoming`.

#### 2.8 Notifications, settings, audit

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null, title text not null, body text,
  entity_type text, entity_id uuid,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user_unread on notifications (user_id, created_at desc) where read_at is null;

create table app_settings (
  key text primary key,
  value jsonb not null,
  super_admin_only boolean not null default false,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
-- seed: reservation_hours=48, max_active_reservations=5, default_commission_type="percentage", default_commission_value=0,
--       bonus_cap_amount=null (SA only), bonus_cap_percent_of_price=null (SA only),
--       company_name="تجديد", company_address, company_phone, company_footer="شكراً لثقتكم في تجديد", receipt_prefix="RC", invoice_prefix="INV",
--       payment_methods=["كاش","تحويل","تقسيط"]

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity_type text not null, entity_id uuid,
  old_values jsonb, new_values jsonb,
  reason text, ip_address inet,
  visibility audit_visibility not null default 'operational',
  created_at timestamptz not null default now()
);
create index audit_entity_idx on audit_logs (entity_type, entity_id);
create index audit_created_idx on audit_logs (created_at desc);
revoke update, delete, truncate on audit_logs from public, anon, authenticated, service_role;
-- plus a BEFORE UPDATE/DELETE trigger raising an exception (defence in depth).
```

`visibility='restricted'` for: user/role/status changes of Admins, national-ID reveal/edit, security events, bonus-cap/default-commission setting changes. Everything else `operational`.

### 3. Storage

Two **private** buckets, same policies on both: `INSERT/UPDATE/DELETE` only for active admins; no public/anon read; reads only via server-generated signed URLs (1 h).
- `product-images`: MIME image/jpeg, image/png, image/webp; file size limit 5 MB (also stores video posters under `products/{product_id}/posters/`).
- `product-videos`: MIME video/mp4, video/webm, video/quicktime; file size limit **50 MB**.

### 4. RLS & access matrix

Helper functions (in schema `private`, `STABLE SECURITY DEFINER`, used as `(select private.is_active_user())` for performance):
`is_active_user()`, `is_admin()`, `is_super_admin()`, `is_sales()` — all check `profiles.status='active'` and `user_roles`.

| Table / object | Sales | Admin | Super Admin |
|---|---|---|---|
| profiles | own row (select; update only `full_name`) | all select; writes via RPC | all |
| user_roles | own row select | select | all; writes via RPC only |
| employee_private_data | own row select + update phone/address | masked via view; decrypt only via server action | same |
| stores | **no access** | all CRUD (RPC for delete/deactivate rules) | all |
| categories | select active (names only) | CRUD | CRUD |
| products / product_components / product_media | **no direct access** (use catalog views/RPCs) | all | all |
| reservations | own rows | all | all |
| price_requests | own rows (insert via RPC) | all (decide via RPC) | all |
| sales / sale_items | own rows via view **without** store_id | all | all |
| sale_payments / sale_installments | read via views for own sales | all (insert via RPC only) | all |
| commissions / commission_bonuses | own rows | all | all |
| commission_payments | own rows | all (insert via RPC only) | all |
| commission_rules(+items) / bonus_rules(+junctions) | **none** | all | all |
| notifications | own rows (select; update `read_at`) | own | own |
| app_settings | select non-sensitive keys needed by UI (payment_methods, company info) | select all, update via RPC | all |
| audit_logs | none | select `visibility='operational'` | all |

**Writes to financial tables happen only through RPCs** (no INSERT/UPDATE/DELETE policies for `authenticated` on `sales`, `sale_items`, `commissions`, `commission_*`, `sale_payments`, `sale_installments`, `reservations`, `price_requests`, `audit_logs`). Plain CRUD (stores, categories, products, bonus_rules) uses policies restricted to `private.is_admin()`; Super-Admin-only fields guarded in RPC/trigger.

#### Sales-facing views / RPCs (never expose `store_id`, store name, `code`, `min_price`)
- `v_catalog` (security definer, `where private.is_sales_or_admin()` ): `public_code, name, description, category_id, category_name, list_price, status(available/partially_sold only), primary_image_path (image only), is_set, est_base_commission, est_bonus, est_total` (computed with `private.calc_earnings(..., list_price, now())`), plus `reserved_by_me boolean` and a masked `is_reserved` flag. Components exposed through `fn_catalog_components(public_code)`. The full gallery (images + videos, ordered, with poster) is exposed through `fn_product_media(public_code)` returning `(kind, storage_path, mime_type, poster_path, duration_seconds, is_primary, sort_order)` only; the server turns paths into signed URLs.
- `v_my_sales` / `v_my_sale_items`: own sales (total, payment status, delivery status) and their items (public code, name, price, status, per-item commission/bonus status); no store/min_price/full code.
- `v_my_commissions`: own commissions with bonus lines.
- `fn_my_dashboard(from, to)`.

### 5. RPC functions (all transactional, audited, role-checked)

| RPC | Role | Steps / guarantees |
|---|---|---|
| `reserve_product(product_id, component_id)` | sales/admin | expire stale reservations; `SELECT … FOR UPDATE` product (+components if set); must be `available`; active-reservation cap; insert reservation; set status `reserved`; broadcast. |
| `cancel_reservation(id)` / `extend_reservation(id, hours)` | owner / admin | restore status; audit. |
| `preview_sale_earnings(items jsonb)` | sales/admin | read-only; items = `[{product_id, component_id, price}]`; same `calc_earnings` per item; validates each price ≥ min_price **without returning min_price** (error names the item only); returns per-item base/bonus lines and totals. |
| `request_price_approval(reservation_id, price, note)` | sales | creates request, keeps hold (`reason=price_request`), notifies admins. |
| `decide_price_request(id, approve, price, note)` | admin | sets `approved_price`; notifies seller. |
| `complete_sale(items jsonb, customer jsonb, payment_method, delivery jsonb)` | sales/admin | 1–10 items, **all-or-nothing**: lock every unit (products, then components, ordered by id) ▸ verify each unit sellable & held by caller (or available) ▸ price rules per item (`>= min_price` or valid per-item `approved_price`) ▸ whole-set sale blocked if `partially_sold` ▸ insert `sales` (one invoice no.), `sale_items` ▸ update product/set statuses ▸ `calc_earnings` per item ▸ insert one `commissions` (pending) + `commission_bonuses` per item ▸ close reservations (`converted`) ▸ audit ▸ notify. |
| `update_sale_customer(sale_id, data)` | seller (while commission pending) / admin | customer fields only; audit old/new. |
| `request_sale_correction(sale_id, note)` | seller | notification to admins. |
| `cancel_sale_item(sale_item_id, reason, restore_status, refund jsonb)` / `cancel_sale(sale_id, reason, restore_status, refund jsonb)` | admin | lock sale + units; item(s) → `cancelled`, `is_live=false`; unit → `available`/`inactive`; set recalculated; that item's commission `pending/approved` → `cancelled` (+ bonuses stay as history), `paid` → one clawback row; recompute `sales.total_price`; if `net_paid > new total` the `refund` param is **required** and recorded as a `refund` payment in the same transaction; set `installments_need_review`; last active item → sale `cancelled`; audit; notify seller. |
| `set_delivery(sale_id, status, date, address, notes)` | admin | updates delivery fields, sets `delivered_at` when `delivered`, audit, notify seller. |
| `delivery_digest()` | pg_cron daily 08:00 Cairo | notify admins about late deliveries; feeds the inbox lists (late / paid-but-undelivered). |
| `record_sale_payment(sale_id, kind, amount, paid_at, method, note, reason)` | admin | lock sale; compute net; enforce `0 <= net <= total`; receipt number; audit. |
| `set_installment_plan(sale_id, rows jsonb)` / `reschedule_installments(sale_id, rows, reason)` | admin | rows sum = `total_price` (active items); supersede old unpaid rows; clear `installments_need_review`; audit. |
| `approve_commissions(ids[], override_reason)` | admin | each: status `pending`, sale not cancelled, sale `paid` or override reason given; audit. |
| `record_commission_payout(user_id, paid_at, method, note)` | admin | lock all that user's `approved` commissions (+ clawbacks) `FOR UPDATE`; net ≥ 0 else error; insert payment; set `payment_id` + `status='paid'`; audit; notify. Double payment impossible (status + unique link). |
| `bulk_update_commission(filters jsonb, ids uuid[], type, value, note)` / `undo_bulk_commission(rule_id)` | admin | log old values; static write; undo only restores unchanged rows. |
| `import_products(rows jsonb, file_name)` | admin | validate all, insert as `inactive`, codes by trigger, one audit entry. |
| `provision_user_audit(user_id, method)`, `set_user_role`, `set_user_status`, `audit_password_action(user_id, action)`, `complete_password_change()` | admin / SA (last one: the user themself) | enforce Admin-vs-Super-Admin rules, last-admin guard; deactivation side effects (cancel reservations, reject price requests); audit; session revocation is done by the server action via service role. |
| `reveal_national_id(user_id)` | admin | server action decrypts; RPC only writes the audit row (`restricted`). |
| `update_setting(key, value)` | admin / SA | SA-only keys guarded; audit old/new. |
| `admin_dashboard_stats(from, to, store_ids[], employee_ids[], category_ids[])` | admin | jsonb of KPIs + series; cancelled sales excluded (shared CTE/view `v_effective_sales`). |
| `expire_reservations()` | pg_cron every 5 min | set `expired`, restore product status, notify 6 h before expiry. |
| `overdue_installments_digest()` | pg_cron daily 08:00 Cairo | notify admins on due date. |

### 6. Realtime
Private Broadcast channel `catalog` via DB trigger (`realtime.broadcast_changes` or `realtime.send`) on product/component/reservation status changes. Payload: `{ public_code, status }` only. `realtime.messages` RLS: active users only. `notifications` table subscribed per user (RLS-filtered).

### 7. Indexes checklist
Per DDL above plus: `sale_items(sale_id)`, `sale_items(product_id)`, `commissions(sale_id)`, `commissions(payment_id)`, `sale_payments(sale_id, created_at)`, `sale_installments(sale_id, due_date)`, `reservations(user_id, status)`, `reservations(expires_at) where status='active'`, `bonus_rules(is_active)`, `product_media(product_id, sort_order)`.

### 8. Seed data (migration `seed_reference`)
Categories (Arabic names, parent/child as in PRD F2), `app_settings` defaults. **No** demo/mock rows. A separate, git-ignored `supabase/seed.dev.sql` may add test users/products for `dev` only.

---



<!-- ===== SECURITY.md ===== -->

# PART 4. Security

## SECURITY

### 1. Non-negotiables
1. **Never trust the client.** Permissions, prices, commissions, bonuses, statuses, totals are decided in Postgres RPCs / RLS. The frontend only displays.
2. **No secrets in code or Git.** Only `.env.example` (placeholders) is committed. Real values live in Vercel env vars (per environment) and a git-ignored `.env.local`.
3. **`service_role` key is server-only**, used in exactly one module: `lib/supabase/admin.ts` (imports `server-only`). It may be used only for Supabase Auth admin operations (create user, invite, set/generate password, reset link, global sign-out, seeding) and only **after** the calling server action verified an active Admin / Super Admin session.
4. **No `NEXT_PUBLIC_` prefix** on anything except the Supabase URL, the anon/publishable key and the site URL.
5. **RLS enabled on every table**; default deny; financial writes only through `SECURITY DEFINER` RPCs (see `DATABASE.md`).
6. The initial password of the Super Admin is **never** written in code, docs, chat, migrations or logs. The owner enters it as an env var for the one-time seed script, then removes it.

### 2. Secrets & env vars

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | per environment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | publishable key only |
| `NEXT_PUBLIC_SITE_URL` | public | used for auth redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | never logged, never sent to client |
| `NATIONAL_ID_ENCRYPTION_KEY` | **server only** | 32 random bytes, base64; **different** in dev and prod |
| `NATIONAL_ID_HASH_KEY` | **server only** | 32 random bytes, base64, separate from the encryption key |
| `SUPER_ADMIN_EMAIL` | seed script only | `moashour258@gmail.com` |
| `SUPER_ADMIN_PASSWORD` | seed script only | entered by owner locally/Vercel once, then deleted |

Losing `NATIONAL_ID_ENCRYPTION_KEY` makes stored national IDs unreadable: back it up in a password manager.

### 3. Authentication & session hardening
- Supabase Auth: **email + password only** (Google/social providers disabled), **sign-ups disabled**, password min length 10, leaked-password protection enabled (Pro), rate limits on. Users exist only if an Admin provisions them (`account_provisions` + `handle_new_user` trigger rejects everything else).
- `middleware.ts` refreshes the session, applies the gate order (login → disabled → must-change-password → complete-profile → role). **Every** `/admin/*` and `/sales/*` layout re-checks role on the server (middleware alone is not sufficient).
- Use `supabase.auth.getUser()` (verified) on the server, never `getSession()` alone, for authorization.
- Deactivation: status flip + `auth.admin.signOut(userId,'global')`; all RLS/RPC call `is_active_user()` so an unexpired JWT is useless.
- **Admin-set passwords** (random or custom, on create or reset): allowed for Admin→Sales and Super Admin→Admin only. The random password is generated server-side with `crypto.getRandomValues` (16 chars, unambiguous alphabet), returned **once** in the action response with `Cache-Control: no-store`, never stored by the app, never logged, never in audit payloads, never emailed. Setting one sets `must_change_password=true` and revokes all of that user's sessions (`auth.admin.signOut(userId,'global')`). Admins can replace a password but can never read one. Server-action input/output objects containing passwords must be excluded from error reporting and logging (redact by key).
- While `must_change_password=true`, `is_active_user()` is false (RLS/RPC deny everything) except `complete_password_change()`.
- User-initiated change requires the current password (re-auth); the "generate random password" button runs in the browser (`crypto.getRandomValues`) and the value is only shown to that user.
- Forgot password uses the Supabase email reset link; reset links are single-use and short-lived.

### 4. National ID & personal data
- Stored only in `employee_private_data` (separate from `profiles`).
- Validate server-side (Egyptian national ID, 14 digits): first digit 2 or 3 (century), valid birth date (YYMMDD), governorate code in {01–04, 11–19, 21–29, 31–35, 88}. Reject duplicates via `national_id_hash`.
- Encrypt with **AES-256-GCM** in the app server (random 12-byte IV per record, store `iv.tag.ciphertext` base64). Store `HMAC-SHA256` hash with the separate key and a masked display value (`29**********34`).
- Admin UI shows only the masked value. "Reveal" is a server action: checks Admin session → decrypts → **writes a `restricted` audit entry (who revealed whose ID)** → returns value for that request only (no caching, `Cache-Control: no-store`).
- National ID can be edited only by Admin, with reason, audited. Employees can edit their own phone/address.
- Sales can never read any other employee's profile/private data; names of other employees are not exposed.

### 4b. Data that Sales must never receive (API, network tab, CSV, notifications, invoices)
`store_id`, store name/code, full product code (`GZ-…`), `min_price`, other employees' data, bonus/commission rule definitions, audit data, national IDs, profit information.
Enforced by: no table access, security-definer views with an explicit column list, and a dedicated test (section 8).

### 5. Input validation & output
- Zod schemas for **every** server action and route handler; reject unknown keys (`.strict()`).
- Server actions are the only write path from UI; each: authenticate → authorize (role) → validate → call RPC → return `{ok,data|error}`; errors are mapped to safe Arabic messages (no SQL/stack leaks).
- Media uploads (images **and videos**): the server issues the signed upload URL only to an active Admin, after checking counts (≤ 10 images, ≤ 3 videos per product), declared MIME and size (images ≤ 5 MB, videos ≤ 50 MB: MP4/WebM/MOV). After upload the server re-reads the real object metadata and sniffs magic bytes (MP4/MOV `ftyp`, WebM `1A45DFA3`, image signatures); mismatches are deleted. Random file names, private buckets, signed URLs (1 h) for every read. Sales never receive raw storage paths, only signed URLs.
- Import files: size ≤ 2 MB, ≤ 500 rows, parsed server-side with a pinned library version, formulas never evaluated, cells length-limited; reject anything not `.xlsx`/`.csv`.
- CSV export: prefix cells that start with `= + - @` with `'` to prevent CSV/formula injection.
- React escapes output; never use `dangerouslySetInnerHTML` with user data.

### 6. Web hardening (Vercel)
`next.config.js` / middleware headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), a CSP restricting scripts to self (+ Supabase domains for `connect-src`/`img-src`), `Permissions-Policy` minimal. `/print/*` pages are authenticated like all others. Supabase Auth: set exact Site URL and allowed redirect URLs (no wildcards in production).

### 7. Audit
Triggers + RPC-internal inserts only; append-only (REVOKE + trigger); `restricted` visibility for admin-management and security events (Super Admin only). Denied-access attempts caught in RPCs are written as `security.denied`.

### 8. Mandatory security tests (must pass before Phase 6 sign-off)
SQL / pgTAP (run as each persona by setting `request.jwt.claims`):
1. Anonymous: zero rows from every table; cannot execute any RPC; a direct sign-up API call with any email fails and creates no `auth.users` row (trigger exception).
2. User with `must_change_password=true`: zero rows everywhere, all RPCs fail except `complete_password_change()`; after it succeeds, access is restored.
3. `inactive` user with a still-valid JWT: zero rows, all RPCs fail.
4. Sales A cannot read Sales B's sales, commissions, notifications, payouts, private data, profile.
5. Sales cannot select from `stores`, `products`, `product_components`, `commission_rules`, `bonus_rules`, `audit_logs`, `app_settings` sensitive keys; `v_catalog` / `v_my_sales` output has no `store_id`, `code`, `min_price`.
6. Sales cannot INSERT/UPDATE/DELETE any financial table directly.
7. Regular Admin cannot create/modify/deactivate Admins or the Super Admin; cannot change SA-only settings; cannot read `restricted` audit rows.
8. Super Admin cannot be deactivated/demoted; last active Admin cannot be deactivated.
9. **Concurrency**: two simultaneous `complete_sale` on the same product → one success, one clean error. Two simultaneous `reserve_product` → same. Whole-set sale racing a component sale → one wins.
10. `record_commission_payout` twice in parallel for the same employee → second pays nothing/fails; no commission in two payouts.
11. `approve_commissions` refused for unpaid sale without override reason; refused for cancelled sale.
12. `cancel_sale` / `cancel_sale_item` after payout creates exactly one clawback per paid commission; clawback deducted in next payout; paid commission row unchanged.
13. `audit_logs` UPDATE/DELETE fails for every role including `service_role`.
14. Sale payments cannot exceed `total_price` or go below zero; future dates rejected; rows cannot be updated/deleted.
15. Price below `min_price` is rejected and the error message does not contain the limit.
16. Media: 11th image / 4th video / video > 50 MB rejected by DB; Sales and anon cannot read `product_media` or list/download from either bucket; non-Admin cannot request an upload URL; a non-video file renamed `.mp4` is rejected and its object deleted.
17. Admin-set passwords: never present in `audit_logs`, app logs, DB rows or emails; a regular Admin cannot set/reset the password of another Admin or the Super Admin; the password action revokes the target user's sessions; weak custom passwords (< 10 chars) are rejected.
18. **Basket atomicity**: two users submitting baskets with overlapping units in opposite order → exactly one succeeds, the other fails cleanly, **no partial rows** and no deadlock; a basket with one invalid item (price below `min_price`, unit already sold) creates nothing.
19. Cancelling an item when `net_paid` exceeds the new total is refused unless a refund is supplied; with it, the refund payment and the cancellation commit together; `installments_need_review` is set; cancelling the last item cancels the sale; cancelled items release their units (`is_live=false`).
20. Sales cannot set/modify delivery data or cancel items; `v_my_sale_items` / delivery fields expose no store, full code or `min_price`; an error for a below-minimum item names the item but never the limit.

App level (Vitest/Playwright): national-ID validator cases, upload rejection (wrong MIME / renamed file), CSV injection escaping, unauthorized route access redirects, `getUser()` usage lint rule, grep check that `SUPABASE_SERVICE_ROLE_KEY` is imported only from `lib/supabase/admin.ts`.

### 9. Operational
- Use Supabase **Pro** on `prod` (daily backups, no pause). Enable PITR if budget allows.
- Rotate keys if ever exposed; never paste secrets into chats, issues or PRs.
- Review audit log weekly (Super Admin).

---



<!-- ===== BUILD_PLAN.md ===== -->

# PART 5. Build plan

## BUILD_PLAN — phases, deliverables, "done" criteria

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

### Phase 0 — Foundation
**Build**
- Next.js (App Router, TS strict), Tailwind, `next-intl` (Arabic only, `dir="rtl"`), font (Cairo / IBM Plex Sans Arabic), `next/font`.
- Design tokens exactly as defined in `BRANDING.md` (colors, Cairo font, radius, shadows, logo placement, favicon generated from the logo). Base UI kit (themed light/dark with `next-themes`, theme toggle in topbar; overlay primitives centered with flex only, tested by Playwright screenshots at 360/768/1440 px in RTL): Button, Input, Select, Dialog (confirm), Toast, DataTable (server pagination), EmptyState, Skeleton, StatCard, Badge, Sidebar + Topbar shell, responsive (table → cards on mobile).
- Supabase clients (server/browser/admin), env validation (`zod`), `.env.example`, lint rules (no `ml-/mr-`, no service-role import outside admin module).
- All migrations from `DATABASE.md`: enums, tables, constraints, indexes, triggers, helper functions, RLS, views, RPC stubs (real bodies arrive in their phases), storage bucket + policies, reference seed (categories, settings).
- `scripts/seed-super-admin.ts` (idempotent; reads `SUPER_ADMIN_EMAIL/PASSWORD` from env; creates confirmed Auth user, profile `active`, `is_super_admin`, role admin, `profile_completed=true`).
- CI: typecheck, lint, unit tests, `supabase db lint`.

**Done when**: `supabase db reset` on dev applies cleanly; seed creates the Super Admin; shell renders in RTL on 360 px and desktop; RLS enabled on 100% of public tables (query proves it).

### Phase 1 — Auth, gates, users
**Build**: login (email + password only, no social login), forgot/reset password, user change-password with random generator, forced `/change-password`, `/disabled`, `/complete-profile` (Zod + national-ID validator + encryption), middleware gates, role layouts, `/account`. User management: **Add user** with 3 options (invitation email / generated random password shown once / custom password; Sales by Admin, Admin by Super Admin), `account_provisions` + trigger, edit, role change rules, activate/deactivate with side effects and global sign-out, password actions on a user (send reset link / random temporary / custom temporary), masked national ID + reveal (audited). Notifications table + bell (basic).
**Done when**: flows in PRD §3 work end to end; SECURITY tests 1–3, 7, 8, 17 pass; Playwright: Admin creates a user with each of the 3 options → login → forced password change → profile gate → role redirect; direct sign-up attempt with an unknown email fails.

### Phase 2 — Catalog (stores, categories, products)
**Build**: stores CRUD (code immutability, delete/deactivate rules, move products), categories (2-level, seed, reorder), products CRUD, code generation trigger, media = images + videos (direct signed uploads with progress, server verification, poster/duration, gallery manager with reorder/primary/delete, signed URLs), sets + components, duplicate product, activation rule (≥ 1 image), search (trigram), filters, **import** (template download, parse, dry-run preview, `import_products`), commission/min_price fields on product form with live example, audit entries.
**Done when**: codes unique/immutable; import dry-run + commit tested with a bad file; store deactivation blocked while stock exists; Sales roles cannot see any of these tables (test 5, partial).

### Phase 3 — Sales side: catalog, reservation, selling
**Build**: `v_catalog` + Realtime broadcast, Sales catalog (cards, search, category/price filters, details, components), reserve/cancel/extend + expiry job, **basket** (`/sales/cart`: add/remove items, customer data, per-item prices, shared `distributeTotal` helper with unit tests, `preview_sale_earnings(items)`), per-item price request + Admin decision, `complete_sale(items…)` (1–10 items, all-or-nothing, basic commission snapshot per item using `calc_earnings`; bonuses plug in via Phase 4), `my-sales`, customer-data correction, "request correction", notifications for Sales, invoice print page (items + delivery status).
**Done when**: SECURITY tests 4–6, 9, 15 pass; Playwright: reserve → request price → approve → basket with 3 items and a negotiated total → sell; two browsers racing the same product; Sales network responses contain no store/code/min_price.

### Phase 4A — Customer payments, installments, receipts
**Build**: `record_sale_payment`, `set_installment_plan`, `reschedule_installments`, `sale_payment_summary` + `installment_status` views, Admin sale detail page (items, payments timeline, refund with reason, installment table, **cancel item / cancel sale** with required refund when overpaid, installments-need-review flag), **delivery tracking** (`set_delivery`, `/admin/deliveries`, Sales read-only status, late / paid-but-undelivered lists, daily digest), receipts print page, overdue digest job + approvals-inbox entries, Sales read-only payment/installment/delivery view.
**Done when**: tests 14, 18, 19, 20 pass; FIFO installment status verified with unit/SQL tests (partial, overdue, refund rewinds status); receipt numbers sequential under concurrency; `distributeTotal` unit tests (sum exact, remainder on highest-priced item, rounding to whole EGP, upward and downward totals).

### Phase 4B — Commissions & bonuses engine
**Build**: bonus rules CRUD (scope junctions, stacking, caps, temporary dates), final `calc_earnings` + `applicable_bonus_rules`, bulk commission page (filters + manual selection + apply + log + **undo**), commission approval screen (pending tab with payment status, override with reason), payouts (`record_commission_payout`, clawback deduction), `cancel_sale` full logic, Sales earnings page (base / bonus / total / status), settings page (all keys, SA-only guards).
**Done when**: SECURITY tests 10–12 pass; worked examples from PRD verified in SQL tests: (a) 10,000 EGP @ 5% = 500; (b) fixed 300; (c) price range 8,000–20,000 +200 bonus; (d) stacked bonuses with cap; (e) historical commissions unchanged after rule/product edits; (f) bulk 5% on 5,000–15,000 range then undo.

### Phase 5 — Dashboards, reports, audit
**Build**: Admin dashboard (11 KPIs + 6 charts + filters, `admin_dashboard_stats`), Sales dashboard (`fn_my_dashboard`), approvals inbox with live counts, reports + CSV exports (UTF-8 BOM, formula-injection escaping), audit page (filters, diff view, SA vs Admin visibility), polishing of loading/empty/error states, accessibility pass.
**Done when**: Playwright screenshots in light **and** dark for every main page, `axe` shows no contrast violations in either theme, dashboards match SQL ground-truth on a seeded dev dataset (cancelled sales excluded); < 2 s with 10k generated sales; exports open correctly in Excel with Arabic text.

### Phase 6 — Security sign-off & production release
**Build/Do**: run **all** tests in `SECURITY.md §8`; security headers/CSP; dependency audit; remove dev seeds; create `prod` Supabase project, apply migrations, configure Auth (sign-ups disabled, email provider only, Site URL/redirect URLs), storage, env vars on Vercel; run Super Admin seed once on prod; smoke-test on the deployed domain (email login, Add user with each option, product with images and a video, sale, payment, approval, payout, receipt print); write `SETUP.md` verification checklist results.
**Done when**: checklist in `SETUP.md §7` fully ticked on production; owner has changed nothing in code to make it work.

---

### Definition of Done (every feature)
- Matches the rule text in `PRD.md` exactly; Arabic strings from `ar.json`; RTL verified.
- Authorization enforced in DB (RLS/RPC) **and** route layout; no client-side money math.
- Loading, empty, error and success states; confirmation dialog for destructive/financial actions.
- Audit entries for every state change listed in PRD F17.
- Tests written (SQL / unit / e2e as appropriate) and passing; no `any`, no `console.log` of sensitive data.

---



<!-- ===== AGENT_OPERATIONS.md ===== -->

# PART 6. Agent operations (GitHub / Supabase / Vercel)

## AGENT_OPERATIONS — Cursor operates GitHub, Supabase and Vercel itself

Cursor (Agent mode, terminal access) performs the repository, database and deployment work **using the official CLIs** (`gh`, `supabase`, `vercel`) that the owner has logged in to once. Goal: the owner approves, Cursor executes.

### 1. One-time setup by the owner (5 minutes, cannot be delegated)
Run these in Cursor's terminal yourself (they open a browser login; Cursor never sees your passwords):
```bash
gh auth login                     # GitHub  (scopes: repo, workflow)
supabase login                    # Supabase (personal access token via browser)
vercel login                      # Vercel
```
Also do manually (no CLI exists or it needs your identity):
1. **Super Admin password**: you type it when the seed script prompts (`read -s`); it is never stored or printed.
2. (Logo already included in `public/` — nothing to do. Optional: later swap it for an SVG.)
3. Say the approval phrases below when you are ready for production.

### 2. What Cursor does autonomously (no need to ask)
**GitHub (`gh`)**
- Create the private repo, push, set default branch `main`, enable branch protection (PR required, CI must pass, no force-push, no deletion).
- One branch per phase: `phase-0-foundation`, `phase-1-auth`, … Conventional commits (`feat:`, `fix:`, `db:`, `test:`, `chore:`).
- Open a PR per phase with the template (what changed, "Done when" checklist, test evidence). Do **not** merge it: the owner reviews and merges (or says "merge phase N", then Cursor merges with `gh pr merge --squash`).
- Add GitHub Actions (`ci.yml`), issue/PR templates, `.gitignore` (must ignore `.env*` except `.env.example`, `.vercel`, `node_modules`, `supabase/.temp`, `supabase/seed.dev.sql`).

**Supabase (`supabase` CLI, DEV project only by default)**
- `supabase link --project-ref <DEV_REF>`; write migrations in `supabase/migrations`; `supabase db push` to **dev**; `supabase db lint`; `supabase test db`; `supabase gen types typescript`; run the Super Admin seed on dev.
- Apply auth/provider config (Site URL, redirect URLs, **email provider only, Google/social disabled, sign-ups disabled**, password policy, Arabic email templates) through `supabase/config.toml` + `supabase config push` or the Management API.
- Create the storage bucket and policies via migrations (never via dashboard clicks).

**Vercel (`vercel` CLI)**
- `vercel link`, `vercel git connect` (GitHub integration), set framework/build settings, `vercel.json` (security headers, region).
- Set environment variables per environment (`Preview`/`Development` → DEV Supabase, `Production` → PROD Supabase) with `vercel env add`.
- Every PR gets a Preview deployment automatically; Cursor reports the preview URL and runs smoke tests against it.

### 3. Secrets rule (critical)
Cursor must be able to configure secrets **without ever displaying them**:
- Generate keys and pipe them straight into Vercel, never `echo`/log/commit them:
  `openssl rand -base64 32 | vercel env add NATIONAL_ID_ENCRYPTION_KEY production` (separate value for preview/dev; **different keys per environment**).
- Fetch Supabase keys without printing: `supabase projects api-keys --project-ref <REF> -o json | jq -r '.[]|select(.name=="service_role").api_key' | vercel env add SUPABASE_SERVICE_ROLE_KEY production`.
- Never paste secrets into chat, code, markdown, commit messages, PR text, logs or test output. If a command would print a secret, redirect/pipe it.
- Never commit `.env*` (except `.env.example`). Run a secret scan (`gitleaks`) before each push; stop if anything is found.
- Remind the owner to back up `NATIONAL_ID_ENCRYPTION_KEY` (it can only be read back from the Vercel dashboard by the owner) — if lost, stored national IDs are unrecoverable.

### 4. Production gates (needs an explicit owner phrase in chat)
| Action | Allowed when |
|---|---|
| `supabase db push` / link to **PROD** | all CI green + SECURITY tests pass on dev + owner writes **`APPROVE PROD DB`** |
| Run Super Admin seed on PROD | owner writes **`APPROVE PROD SEED`** and types the password in the terminal prompt |
| Set Production env vars | during the first prod release, after `APPROVE PROD DB` |
| Production deploy (`main` merge / `vercel --prod`) | PR merged by owner + preview smoke test passed + owner writes **`APPROVE PROD DEPLOY`** |
| Anything that deletes data, resets the DB, or rotates encryption keys on PROD | never without a written, specific instruction; always take/confirm a backup first |

### 5. Forbidden for the agent
- Push to `main`, force-push, delete branches/tags of others, merge its own PR (unless the owner says "merge phase N"), disable/skip CI or hooks (`--no-verify`).
- `supabase db reset` or destructive SQL on PROD; editing applied migrations; schema changes through the dashboard.
- Reading, printing, committing or sending secrets/`.env*` values anywhere; using the service-role key in client code.
- Changing RLS/permissions to "make a test pass"; weakening any rule in `PRD.md`/`SECURITY.md` without asking.
- Installing unpinned or very new dependencies without noting them in the PR (pin exact versions).

### 6. Per-phase loop (what the owner sees)
1. Cursor creates branch `phase-N-…`, plans (Plan mode), implements, writes tests.
2. Applies migrations to **dev**, regenerates types, runs all tests (`npm run lint && npm run typecheck && npm test && supabase test db`).
3. Pushes, opens PR, waits for CI, posts the preview URL + "Done when" checklist with results.
4. Owner reviews → says `merge phase N` → Cursor squash-merges, deletes the branch, starts the next phase.
5. After Phase 6: owner gives the three production approvals; Cursor executes the release and runs the `SETUP.md §7` checklist against the production URL, reporting each item as pass/fail.

### 7. Rollback
- App: `vercel rollback` to the previous production deployment, or revert the merge commit.
- DB: forward-fix migration (never edit applied ones). For data incidents use Supabase backups (Pro) — only on explicit owner instruction.

### 8. Optional integrations (keep them least-privilege)
- Supabase MCP in Cursor: connect **only to the dev project**, read-only unless doing migrations through the CLI. Never connect it to prod.
- GitHub MCP is unnecessary; `gh` covers it.

---



<!-- ===== SETUP.md ===== -->

# PART 7. Owner setup

## SETUP — what YOU (the owner) must do manually

> **Update:** Cursor now operates GitHub, Supabase and Vercel itself through their CLIs (see `AGENT_OPERATIONS.md`). Sections 6–7 below are executed by Cursor; you only do the one-time CLI logins, the Super Admin password prompt, and the production approvals.

These steps need your accounts and secrets, so only you can do them. **Never paste any secret into Cursor chat, GitHub, issues or this repo.**

### 1. Accounts
- GitHub (private repo), Supabase, Vercel. (No Google Cloud needed: there is no Google sign-in.)
- Supabase **Pro** is recommended for `prod` (daily backups, no pausing).

### 2. Supabase — create two projects
Create `crm-dev` and `crm-prod` (choose the region closest to Egypt, e.g. Frankfurt; Vercel functions are set to `fra1` in `vercel.json`).
For each project, collect from *Project Settings → API*: Project URL, anon/publishable key, service-role key (**secret**).

In *Authentication*:
1. Providers → enable **Email** only. Disable Google and every other provider. **Turn OFF "Allow new users to sign up"** (accounts are created only by Admins).
2. Password policy: minimum length **10**; enable leaked-password protection (Pro).
3. URL Configuration → Site URL and Redirect URLs (exact, no wildcards in prod):
   - dev: `http://localhost:3000/**`, your Vercel preview URL pattern
   - prod: `https://<your-domain>/**`
4. Email templates (Invite, Reset password): translate to Arabic; keep the `{{ .ConfirmationURL }}` link.

In *Database → Extensions*: enable `pg_cron`, `pg_trgm`, `citext`, `pgcrypto`.
In *Realtime*: keep Broadcast enabled (private channels).

### 3. (Removed) Google OAuth
Not used. Login is email + password; accounts are created by an Admin inside the app (invitation email, generated random password, or custom password).

### 4. Environment variables

Copy `.env.example` to `.env.local` for local development. On Vercel, add them per environment (Preview → dev project values, Production → prod project values).

| Variable | Where | How to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | Supabase API settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | Supabase API settings |
| `NEXT_PUBLIC_SITE_URL` | Vercel + local | `http://localhost:3000` / your domain |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + local (server) | Supabase API settings — **secret** |
| `NATIONAL_ID_ENCRYPTION_KEY` | Vercel + local | `openssl rand -base64 32` — different for dev/prod; **back it up** |
| `NATIONAL_ID_HASH_KEY` | Vercel + local | `openssl rand -base64 32` |
| `SUPER_ADMIN_EMAIL` | seed run only | `moashour258@gmail.com` |
| `SUPER_ADMIN_PASSWORD` | seed run only | **you choose** (strong, 14+ chars); set only for the seed run, then delete |

### 5. Branding & company data
- The logo is already in this pack (`public/logo.jpg`, white background) and the brand system is in `BRANDING.md`. Optional later: replace it with an SVG/PNG with transparent background for a crisper sidebar/favicon.
- Company name is **تجديد**. Prepare: address, phone, footer text for receipts/invoices (entered later in Settings).

### 6. Deployment steps
1. Push the repo to GitHub (private). Confirm `.env*` (except `.env.example`) is git-ignored.
2. Link the Supabase CLI: `supabase link --project-ref <dev-ref>` → `supabase db push`. Repeat for prod **only after dev tests pass**.
3. Run the Super Admin seed **once per environment** (locally, with the target project's env vars): `npm run seed:super-admin`. Then delete `SUPER_ADMIN_PASSWORD` from wherever you set it.
4. Vercel: *Import Project* from GitHub → framework Next.js → add env vars → deploy. Production branch = `main`; every PR gets a Preview linked to `dev`.
5. Add your custom domain in Vercel, then update Supabase Site URL/Redirect URLs to that domain.

### 7. Production verification checklist (tick all before go-live)
- [ ] Super Admin signs in with email + password on the production domain; full admin access.
- [ ] No Google button anywhere; sign-up is impossible (try the Supabase signup endpoint with a random email: it must fail).
- [ ] Add a Sales user with each option: invitation email arrives (Arabic) and lets them set a password; generated random password is shown once; custom password works. Admin-set passwords force a password change at first login.
- [ ] A user can change their password anytime and the "generate random password" button works; forgot-password email arrives.
- [ ] Sales user sees catalog **without** store name / full code / min price (check browser network tab).
- [ ] Create store, categories, product with images **and a video**; media URLs are signed and expire; the video plays on desktop and mobile.
- [ ] Reserve → request price → approve → sell → invoice prints with logo.
- [ ] Record customer payment (and installments) → receipt prints; commission can be approved only when paid.
- [ ] Payout recorded once; second attempt does not double-pay.
- [ ] Cancel a paid sale → clawback appears in next payout.
- [ ] Audit log shows all actions; Admin cannot see restricted entries; Super Admin can.
- [ ] Deactivate a user → they are logged out and cannot access anything.
- [ ] Backups enabled (Pro) and `NATIONAL_ID_ENCRYPTION_KEY` stored in a password manager.

### 8. Things Cursor may ask you for
Domain name, receipt text, confirmation of the *Assumptions* list at the end of `PRD.md`.

---



<!-- ===== .env.example ===== -->

# PART 8. .env.example

```dotenv
# ===== Public (safe for the browser) =====
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# ===== Server only (NEVER prefix with NEXT_PUBLIC_, never commit real values) =====
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
# generate each with: openssl rand -base64 32   (different values for dev and prod)
NATIONAL_ID_ENCRYPTION_KEY=BASE64_32_BYTES
NATIONAL_ID_HASH_KEY=BASE64_32_BYTES

# ===== One-time Super Admin seed (set only while running `npm run seed:super-admin`, then remove) =====
SUPER_ADMIN_EMAIL=moashour258@gmail.com
SUPER_ADMIN_PASSWORD=
```

---



<!-- ===== KICKOFF_PROMPT.md ===== -->

# PART 9. Kickoff prompt

## Paste this into Cursor (Agent mode) after opening the repo folder

You are the senior full-stack engineer for this project. Read `README.md`, `PRD.md`, `DATABASE.md`, `SECURITY.md`, `BUILD_PLAN.md`, `AGENT_OPERATIONS.md`, `SETUP.md`, `BRANDING.md` and all `.cursor/rules/*`.

You operate GitHub, Supabase and Vercel yourself through their CLIs, following `AGENT_OPERATIONS.md` strictly (DEV by default; PROD only after my exact approval phrases; never expose secrets).

Start now:
1. Verify the CLIs are installed and logged in (`gh auth status`, `supabase projects list`, `vercel whoami`). If something is missing, tell me the exact command to run.
2. Create the private GitHub repo, commit this pack, protect `main`, add CI (`.github/workflows/ci.yml`) and the PR template.
3. Ask me **only** for what you cannot do yourself (DEV/PROD Supabase project refs if the projects don't exist yet — create them with the CLI if you can).
4. Execute **Phase 0 only** on branch `phase-0-foundation`, open the PR, and wait for my review before Phase 1.

---

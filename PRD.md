# PRD — Sales, Inventory, Payments & Commission CRM

> Internal CRM for **تجديد (Tajdeed) — لأدوات منزلية مستعملة**, a company selling **used furniture, household appliances and home equipment** (Egypt).
> Read together with: `DATABASE.md`, `SECURITY.md`, `BUILD_PLAN.md`, `.cursor/rules/*`, `SETUP.md`, `i18n/ar.json`.
> **Every rule in this file was explicitly agreed with the product owner. Do not invent alternatives. If something is ambiguous, ask.**

---

## 1. Goals

1. Admins manage stores, products, employees, commissions, bonuses, customer payments and reports.
2. Sales employees browse available products, reserve them, register sales and track their own earnings.
3. All money logic is **server-side (Postgres)**, auditable, append-only and transaction-safe.
4. Production-ready: secure, RTL Arabic UI, responsive (desktop / tablet / mobile), deployed on Vercel + Supabase.

Non-goals are listed in section 11.

## 2. Stack (mandatory)

Next.js (App Router) + React + TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) · Vercel.
No Firebase / MongoDB / local JSON / ORM. No mock data anywhere: everything runs against a real Supabase `dev` project.

## 3. Users, roles, account lifecycle

### 3.1 Roles
| Role | Notes |
|---|---|
| `admin` | Full operational access. Manages Sales users. |
| `sales` | Sees only their own money. Never sees store names, `min_price`, other users' data. |
| Super Admin | **Not a role.** A flag `profiles.is_super_admin = true` on exactly one admin (`moashour258@gmail.com`). |

Super Admin only can: create / edit / deactivate / demote **Admin** accounts, see the full audit log, change `bonus_cap_*` and `default_commission_*` settings. A regular Admin cannot touch other Admins. The Super Admin can never be deactivated, demoted or deleted (UI **and** DB trigger). The last active Admin cannot be deactivated.

### 3.2 Access model: invitation / admin-provisioned accounts only
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

### 3.3 Authentication & passwords
- **Email + password only.** Login page: email, password, "forgot password".
- **User can change their password at any time** (`/account`): current password + new password, with a **"Generate strong random password"** button that fills the field (shown with copy/show toggles). Changing it signs out the user's other sessions.
- **Forgot password**: email link (Supabase reset). 
- **Admin password actions on a user** (Admin on Sales users; Super Admin on Admin users): *Send reset link*, *Generate random temporary password* (shown once), *Set custom temporary password*. Any Admin-set password sets `must_change_password = true`, revokes all of that user's sessions, and is audited (who/for whom/when — never the value). Admins can never **view** an existing password, only replace it.
- Password policy: min 10 chars (custom or user-chosen); random generator = 16 chars from an unambiguous alphabet (no `0O1lI`), `crypto.getRandomValues` on the server; rate limiting on; leaked-password protection when on Pro.
- The Admin dialog that shows a generated password warns: *"Give it to the employee through a private channel; it won't be shown again."*

### 3.4 Deactivation
Immediate effect: `profiles.status = 'inactive'` → every RLS policy and RPC checks `is_active_user()`; all sessions revoked (`auth.admin.signOut(userId, 'global')`); active reservations cancelled (products back to `available`); pending price requests rejected ("account deactivated"). Earned `pending`/`approved` commissions **remain payable**. Users with any sales/commissions are never hard-deleted. Re-activation restores role and data.

**Acceptance criteria**
- A sign-up attempt with an unknown email (API or UI) fails; no `auth.users` row is created without server provisioning (DB test).
- A user with `must_change_password = true` can read/write nothing until they set a new password (SQL test with that user's JWT).
- Passwords set or generated by an Admin never appear in logs, audit rows, DB tables or emails (grep + test on audit payloads).
- Deactivated user's existing JWT cannot read or write anything (SQL test).
- Admin cannot modify another Admin; Super Admin cannot be deactivated or demoted by anyone.

---

## 4. Global conventions

- Language: **Arabic RTL only** (no language switcher, no English UI in v1). All strings from `next-intl` messages (`i18n/ar.json`). Tailwind logical utilities only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`).
- Currency: **EGP only**. DB `numeric(12,2)`. Display with `Intl.NumberFormat('ar-EG')` but **Latin digits** (1,234.50). Rounding: half-up to 2 decimals, done in SQL only.
- Time: store `timestamptz` (UTC); display in `Africa/Cairo`; Gregorian dates.
- Codes: full code `GZ-00127` (Admin only) / public code `P-00127` (Sales). See F3.
- **Theme:** Light / Dark / System (default System), toggle in topbar and `/account`, per device, no DB column; tokens in `BRANDING.md`. Print pages always light.
- **Overlays (dialogs, confirm dialogs, drawers, popovers, dropdowns, toasts) are centered/anchored with flex or logical `inset-*` only — never `translate`, `left-*`, `right-*`, `start-1/2`** (they break in RTL and clip on the left). One shared primitive per overlay type, panel `max-h-[90dvh]` scrolling inside, fully inside the viewport at 360 px.
- Confirmation dialogs for destructive/financial actions; loading, empty and error states on every list; toast on success/failure.
- Branding: the logo is supplied (`public/logo.jpg`); palette, typeface, shapes and logo usage are defined in **`BRANDING.md`** (navy `#10324D`, blue `#397AD2`/`#2F67B8`, teal `#4EC1D3`, font Cairo). Never invent, redraw or recolor the logo.

---

## 5. Features

### F1 — Stores (Admin)
- CRUD: name, `store_code` (2–4 uppercase Latin letters, unique), address, phone, notes, active flag.
- `store_code` is immutable once any product uses the store.
- Hard delete only if no products and no historical sales reference it (`ON DELETE RESTRICT`); otherwise **deactivate**. Deactivated stores disappear from new-product dropdowns but stay visible on historical records.
- A store with `available`/`reserved` products cannot be deactivated until the Admin moves them (UI offers "move products to another store").
- **Store names are never visible to Sales** — not in catalog, details, sales history, CSV, notifications, invoices.

### F2 — Categories (Admin)
- Two levels only (parent → child), enforced in DB. Seed (Arabic names in migration):
  - الأثاث: كنب، غرف نوم، دواليب، مطابخ، أثاث مكتبي، مكاتب، كراسي، ترابيزات
  - الأجهزة المنزلية: غسالات، ثلاجات
  - أغراض منزلية أخرى
- Admin can add / edit / reorder / deactivate. Same delete rules as stores. Filtering by a parent includes its children.

### F3 — Products (Admin)
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

### F4 — Reservations (Sales / Admin)
- A Sales user can reserve an `available` product (or component) for **48 h** (setting `reservation_hours`), max **5 active** per user (`max_active_reservations`).
- Others see "reserved" and cannot reserve or sell it. Only the owner can complete the sale.
- Expires automatically (pg_cron every 5 min **and** lazy check inside every RPC). Owner can cancel; Admin can cancel or extend any reservation.
- 6 h before expiry the owner gets a notification.
- A pending price request automatically holds the product (`reason = price_request`) until the decision.

### F5 — Sales dashboard & catalog (Sales)
Catalog of products that are `available` (and `partially_sold` sets' remaining components), each card: primary image, name, **public** code, category, list price, short description, **estimated** commission / bonus / total (computed at list price, labeled "تقديري"). **No store name, no store filter.**
Search (name / public code), filters (category incl. children, price range), sort, product details page (media gallery with images and videos, description, components), actions: Reserve, **Add to sale** (basket).
Live updates when a colleague reserves/sells (Realtime Broadcast from DB trigger on a private channel carrying only public code + status; fallback polling 30 s).

### F6 — Registering a sale: multi-product basket (Sales)
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

### F7 — Sales history & earnings (Sales)
Own sales only: date, items (public codes, price each), customer, total, payment status, delivery status, per-item commission status (pending / approved / paid / cancelled), base + bonus + total per item and per sale. Commissions waiting for customer payment show "بانتظار تحصيل العميل". CSV export of own sales. Dashboard KPIs: products sold, revenue, earned commission, earned bonus, pending / approved / paid, recent sales, performance over time. **No leaderboard / peer comparison. No profit margin, store, or min_price.**

### F8 — Commissions (Admin)
- Per product (and per component): `commission_type` (`percentage` | `fixed`) + `commission_value` stored on the row. Percentage ∈ [0,100], fixed ≥ 0 (capped at sale price when applied).
- New products take defaults from settings (`default_commission_type/value`, initially 0%).
- **Bulk update**: filters (store, category incl. children, price range min/max, status, search) + manual selection (all matching or ticked) → apply type/value. It is a **static write at execution time**; later products are unaffected.
- Every bulk run is logged in `commission_rules` (+ `commission_rule_items` with old values) → **Undo** restores old values only for items still equal to what the batch set (others reported as skipped).
- Sales' catalog reflects changes immediately.
- Calculation base: `sale_price` for percentage; fixed stays fixed.

### F9 — Bonuses (Admin)
`bonus_rules`: name, type (`percentage` of sale price | `fixed`), value, scope, optional start/end (temporary promos), active flag. Scope dimensions (all optional, **AND across dimensions, OR within one**): specific products, categories, stores, price range `[min,max]` **evaluated on the actual sale price**. At least one scope dimension or a price range is required.
- Create / edit / activate / deactivate; multiple rows stacked.
- All applicable active rules at the sale timestamp **stack**. Optional global caps (`bonus_cap_amount`, `bonus_cap_percent_of_price`, Super Admin only; the stricter applies).
- Each applied rule is snapshotted as a row in `commission_bonuses` (rule name, type, value, amount). Editing a rule never changes past sales.
- Sales UI shows base commission, bonus (per line on details), total expected earnings.

### F10 — Customer payments & installments (Admin records)
- Each sale has `total_price` (sum of its **active** items); `payment_status` is **computed**: `unpaid` | `partial` | `paid`.
- Admin records payments in `sale_payments` (**append-only**): `payment` or `refund`, amount > 0, date ≤ today, method, note. Net paid can never exceed `sale_price` or go below 0. Corrections = a reversing `refund`, with mandatory reason. Each row gets a sequential receipt number `RC-000123`.
- **Installment plan (optional)**: Admin defines rows in `sale_installments` (seq, due_date, amount; a down payment is row 0 due on sale date). Sum of rows must equal `sale_price`. Payments are **not** tied to a row; installment status (`paid` / `partial` / `overdue` / `upcoming`) is **computed FIFO** from cumulative net payments. Rescheduling unpaid rows requires a reason (audited). If an item is cancelled the total changes and the plan is flagged **needs review** (shown in the approvals inbox) until the Admin reschedules it.
- Overdue installments appear in the Admin approvals inbox (count + list: customer, amount, days late) and a notification on the due date. No late fees, no customer reminders (SMS/WhatsApp) in v1.
- Sales see payment status and the installment schedule of **their own** sales, read-only, no notifications.
- If a sale with payments is cancelled, Admin records the customer refund as a `refund` payment.

### F11 — Commission lifecycle (Admin)
`pending` → `approved` → `paid`; side states `cancelled` and `clawback`.
1. `complete_sale` creates the commission (`pending`) with immutable snapshot: type, value, base amount, bonus lines, total.
2. **Approve**: Admin approves one or many `pending` commissions. RPC refuses unless the sale is fully `paid`; override allowed with a **mandatory reason** (audited). No auto-approval.
3. **Pay**: Admin records a payout for one employee covering **all** their `approved` commissions (and clawbacks) → `commission_payments` row; included commissions become `paid`. A commission can belong to exactly one payout (unique/locked); duplicate payment impossible. Net payout must be ≥ 0 (negative balances carry forward).
4. **Cancel an item or a whole sale** (Admin only, mandatory reason; item = one product/component of the basket): the unit returns to `available` (or `inactive` if damaged); the item's `pending`/`approved` commission + bonuses → `cancelled`; if already `paid` → a **clawback** row (negative amount, `approved`) is created and deducted automatically from the employee's next payout. Paid rows are never edited or deleted. The sale `total_price` is recalculated from its remaining active items; if the customer has already paid **more than the new total**, the cancel action must include a customer **refund** for the excess (recorded atomically as a `refund` payment); the installment plan is flagged for review. When the last active item is cancelled the whole sale becomes `cancelled`. Cancelling a whole sale cancels all its active items in one transaction.
5. Employees see their own statuses; Admin sees all with filters and CSV export (payables per employee per period).

### F12 — Admin dashboard & reports
KPIs: total / available / reserved / sold products, stores, admins, sales employees, completed sales, revenue, total commissions, total bonuses. Charts: sales over time, by store, by category, top products, employee performance, commission distribution. Filters: date presets + custom, store, employee, category. All numbers from SQL views/RPCs (`admin_dashboard_stats`); cancelled sales excluded everywhere via one shared definition.
CSV exports (UTF-8 with BOM): sales, commission payables per employee/period, inventory with statuses, audit log, overdue installments, undelivered/late deliveries. Sales can export only their own sales. No PDF/Excel exports in v1.

### F13 — Notifications & approvals inbox
- **Admin**: bell + `/admin/approvals` listing counts and actions for: price requests, pending commissions awaiting approval, overdue installments, installment plans needing review, late or paid-but-undelivered sales, correction requests. Counts come from live queries on source tables (no separate table).
- **Sales**: `notifications` table + Realtime: price decision, commission approved/paid, sale cancelled, reservation expiring, correction handled.
- Email only for Supabase Auth messages (invitation link, password reset). Passwords are never sent by email. No WhatsApp/SMS.

### F14 — User management (Admin)
List with registration date, role, status (`active` / `inactive`), last sign-in; **Add user** (Admin accounts by Super Admin only, Sales by Admin) with the three access options of §3.2; edit info; change role (Super Admin for Admin roles); activate/deactivate; password actions of §3.3 (send reset link / generate random temporary password / set custom temporary password); view masked national ID (reveal button decrypts server-side and **logs an audit entry**). Sales never see anyone else.

### F15 — Receipts & invoices
Browser-print pages (A4 + optional receipt-roll CSS) with logo and company data from settings. Payment receipt `RC-######` per payment/refund (Admin). Sale invoice `INV-######` per sale (Admin and the selling Sales user; **without** commission/store/min_price). Generated from stored data; cancelled sales show a "ملغاة" mark. No VAT / e-invoice in v1.

### F16 — Settings (`app_settings`)
`reservation_hours` (48), `max_active_reservations` (5), `default_commission_type/value` (percentage, 0) and `bonus_cap_amount`, `bonus_cap_percent_of_price` (**Super Admin only**), company name/address/phone/footer text, `receipt_prefix` (RC), `invoice_prefix` (INV), `payment_methods` list. Every change audited (old/new).

### F17 — Audit log
Append-only (no UPDATE/DELETE for any role incl. service role from the app). Written by DB triggers and inside RPCs, never by the frontend. Columns: actor, action, entity type/id, old/new JSON, reason, IP (from request headers, passed to RPC), timestamp, `visibility` (`operational` | `restricted`).
Logged: user/role/status changes, national-ID edits and reveals, product/store/category CRUD and moves, price/min_price changes, bulk commission + undo, bonus rule changes, approvals, payouts, sale cancellations, clawbacks, customer payments/refunds/reschedules, price decisions, settings changes, failed/denied access attempts, imports.
Super Admin sees everything; Admin sees `operational` only (not admin-management or security events); Sales see nothing. Filters: actor, action, entity, date; CSV export.

### F18 — Delivery tracking (Admin manages, Sales read-only)
- Each sale has `delivery_status`: `pending` (default) / `scheduled` / `delivered` / `pickup` (customer collects), plus `delivery_date` (planned), `delivery_address` (defaults to the customer address), `delivery_notes`, and `delivered_at` (set when marked delivered).
- Admin updates it from the sale page and from `/admin/deliveries` (list with filters: status, date range, late). Sales see the delivery status of **their own** sales (read-only) and get a notification when it changes. It is printed on the invoice.
- Reports in the approvals inbox: **late deliveries** (scheduled date passed, not delivered) and **paid but undelivered** sales.
- **Not linked to commission approval** (that depends only on customer payment, F11). No delivery fees, drivers or route planning in v1; transport costs, if any, go in the notes.
- Every delivery change is audited. Cancelled sales hide delivery data.

---

## 6. Route map

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

## 7. Non-functional requirements
- Responsive down to 360 px; tables become cards on mobile; touch targets ≥ 44 px.
- Lists paginated server-side; dashboards < 2 s on 10k sales; indexes per `DATABASE.md`.
- Accessibility: keyboard navigation, focus states, labels, contrast AA.
- Errors never leak internals; all server actions return `{ ok, data | error }` with Arabic messages.

## 8. Testing requirements (summary; details in `BUILD_PLAN.md`)
pgTAP/SQL tests for RLS and RPCs (concurrent sales, Sales data isolation, deactivated JWT, duplicate payout), Vitest for validators (national ID, Zod schemas), Playwright for: Admin creates user (invite / random password / custom password) → login → forced password change → profile gate; reserve → sell → approve → pay; price request flow; import flow.

## 9. Deployment
Two Supabase projects (`dev`, `prod`), Vercel Preview → dev, Production → prod. Migrations only via Supabase CLI in Git. Secrets in Vercel env only. See `SETUP.md`.

## 10. Data the owner must supply
Receipt details (address, phone, footer text; company name = «تجديد», logo already supplied), production domain, Super Admin password (entered by the owner in the environment, never in code), Supabase/Vercel/GitHub accounts.

## 11. Out of scope (v1)
Multi-currency, English UI, customers table / repeat-customer tracking, VAT & e-invoicing, late fees, customer SMS/WhatsApp/email reminders, PDF/Excel report export, peer leaderboard, per-store restriction for Sales, auto-approval of commissions, purchase-cost / profit tracking (the company only displays and sells, it does not buy), settlements with store owners or consignors (handled outside the system), delivery fees / drivers / route planning, invoice-level discounts (discounts are per item).

## 12. Assumptions to confirm before building
1. Seeded Super Admin is exempt from the blocking profile-completion gate (they asked for full access immediately); a banner requests their private data.
2. Invoices are issued by Admin or the seller; customers do not log in.
3. Imported/new products stay `inactive` until an image exists and an Admin activates them (videos are optional).
4. Components of a set are limited to 26 (suffix A–Z).
5. The price-approval grant lasts as long as the reservation hold (48 h by default).
6. A negotiated basket total may be higher or lower than the sum of list prices; the proportional distribution works in both directions and each item is still validated against its own `min_price`.
7. Reservation cap (5) counts held reservations only; items added directly to a basket from `available` stock do not need a reservation but are locked at submit.

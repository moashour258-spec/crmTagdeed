# Changelog

## Phase 6 — Security sign-off (local)

- Added the remaining database checks: RLS on every public table, anonymous reads, sales blocked from money and media writes, video limits, and an audit log that `service_role` cannot edit.
- Content security policy is also sent by Vercel. Sign-up stays off and the password minimum is 10 characters.
- Production checklist stays open. Deploying the production database still needs the owner's approval phrases.

## Phase 5 — Dashboards, reports, audit

- The admin dashboard reads eleven figures and six breakdowns from one database call. Cancelled sales stay out of the totals.
- A salesperson sees only their own sold pieces, revenue, commission, and recent invoices.
- The approvals inbox shows live counts for prices, commissions, installments, deliveries, and correction requests.
- CSV exports use UTF-8 and keep formula-looking cells as text. Sales can export only their own invoices.
- The audit page filters events and shows the before and after values. A regular admin does not see restricted rows.

## Phase 4B — Commissions and bonuses

- Bonus rules need a price range or a product, category, or store. Active rules stack, then the stricter cap scales the lines.
- Admins approve pending commissions after the invoice is paid, or with a written reason. A cancelled invoice is refused.
- A payout locks one employee's approved commissions and clawbacks, stores one payment, and leaves a negative net for the next payout.
- Bulk commission edits are a snapshot. Undo restores only rows that still hold the value that batch wrote.
- Sales see their own base, bonus, total, and status. An unpaid invoice stays "بانتظار تحصيل العميل".

## Phase 4A — Payments, installments, delivery

- Admins record payments and refunds. A receipt number is issued, and the net paid stays inside the invoice total.
- Installment status is calculated from the payments in order: paid, partial, overdue, or upcoming. A refund moves that status back.
- Cancelling an item requires a refund when the customer has paid more than the new total. The last item cancels the invoice and returns the piece.
- Delivery updates, late deliveries, and paid-but-undelivered sales show in the admin inbox. Sales see their own payment and delivery status only.
- Payment rows cannot be edited or deleted.

## Phase 3 — Sales

- A salesperson sees the public catalog, reserves a piece, asks for a price, and sells from a basket of up to ten lines.
- An agreed total is split into whole pounds, with the leftover pound on the highest list price.
- A price under the floor is rejected and the message names the piece without revealing the floor.
- Two competing reservations or sales cannot both win. A sold piece of a set blocks selling the whole set.
- Salespeople cannot read another seller's invoices, commissions, or private profile, and cannot write financial tables directly.
- The invoice print shows the customer and the public codes only.

## Phase 2 — Catalog

- Stores can be added, deactivated, and their available stock moved without changing product codes.
- Categories stay on two levels and can be reordered.
- Products are created inactive, with a live commission example, duplication, and image or video upload that checks the file bytes.
- Spreadsheet import previews bad rows and saves only the valid ones through one database call.
- Sales still cannot read stores, products, or media.

## Phase 1 — Auth, gates, users

- Email and password login, password reset, forced password change, disabled account, and profile completion with encrypted national ID.
- Middleware sends each session to the right gate. Sales navigation hides admin pages.
- Admins add users by invitation, random password, or custom password. Password values are shown once and are not written to the audit log.
- Notification bell reads the signed-in user's own rows.
- SQL checks cover anonymous access, locked and inactive sessions, admin boundaries, and password actions.

## Phase 0 — Foundation

- Next.js app in Arabic, RTL, with Cairo, light/dark/system themes, and the تجديد shell.
- Supabase clients, env validation, and national-ID encryption helpers.
- Migrations for the full schema, RLS, sales-safe views, reference categories, and RPC stubs.
- Local database check covers the Super Admin bootstrap, RLS, and commission math examples of 500 and 300 EGP.

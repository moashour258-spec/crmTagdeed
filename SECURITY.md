# SECURITY

## 1. Non-negotiables
1. **Never trust the client.** Permissions, prices, commissions, bonuses, statuses, totals are decided in Postgres RPCs / RLS. The frontend only displays.
2. **No secrets in code or Git.** Only `.env.example` (placeholders) is committed. Real values live in Vercel env vars (per environment) and a git-ignored `.env.local`.
3. **`service_role` key is server-only**, used in exactly one module: `lib/supabase/admin.ts` (imports `server-only`). It may be used only for Supabase Auth admin operations (create user, invite, set/generate password, reset link, global sign-out, seeding) and only **after** the calling server action verified an active Admin / Super Admin session.
4. **No `NEXT_PUBLIC_` prefix** on anything except the Supabase URL, the anon/publishable key and the site URL.
5. **RLS enabled on every table**; default deny; financial writes only through `SECURITY DEFINER` RPCs (see `DATABASE.md`).
6. The initial password of the Super Admin is **never** written in code, docs, chat, migrations or logs. The owner enters it as an env var for the one-time seed script, then removes it.

## 2. Secrets & env vars

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

## 3. Authentication & session hardening
- Supabase Auth: **email + password only** (Google/social providers disabled), **sign-ups disabled**, password min length 10, leaked-password protection enabled (Pro), rate limits on. Users exist only if an Admin provisions them (`account_provisions` + `handle_new_user` trigger rejects everything else).
- `middleware.ts` refreshes the session, applies the gate order (login → disabled → must-change-password → complete-profile → role). **Every** `/admin/*` and `/sales/*` layout re-checks role on the server (middleware alone is not sufficient).
- Use `supabase.auth.getUser()` (verified) on the server, never `getSession()` alone, for authorization.
- Deactivation: status flip + `auth.admin.signOut(userId,'global')`; all RLS/RPC call `is_active_user()` so an unexpired JWT is useless.
- **Admin-set passwords** (random or custom, on create or reset): allowed for Admin→Sales and Super Admin→Admin only. The random password is generated server-side with `crypto.getRandomValues` (16 chars, unambiguous alphabet), returned **once** in the action response with `Cache-Control: no-store`, never stored by the app, never logged, never in audit payloads, never emailed. Setting one sets `must_change_password=true` and revokes all of that user's sessions (`auth.admin.signOut(userId,'global')`). Admins can replace a password but can never read one. Server-action input/output objects containing passwords must be excluded from error reporting and logging (redact by key).
- While `must_change_password=true`, `is_active_user()` is false (RLS/RPC deny everything) except `complete_password_change()`.
- User-initiated change requires the current password (re-auth); the "generate random password" button runs in the browser (`crypto.getRandomValues`) and the value is only shown to that user.
- Forgot password uses the Supabase email reset link; reset links are single-use and short-lived.

## 4. National ID & personal data
- Stored only in `employee_private_data` (separate from `profiles`).
- Validate server-side (Egyptian national ID, 14 digits): first digit 2 or 3 (century), valid birth date (YYMMDD), governorate code in {01–04, 11–19, 21–29, 31–35, 88}. Reject duplicates via `national_id_hash`.
- Encrypt with **AES-256-GCM** in the app server (random 12-byte IV per record, store `iv.tag.ciphertext` base64). Store `HMAC-SHA256` hash with the separate key and a masked display value (`29**********34`).
- Admin UI shows only the masked value. "Reveal" is a server action: checks Admin session → decrypts → **writes a `restricted` audit entry (who revealed whose ID)** → returns value for that request only (no caching, `Cache-Control: no-store`).
- National ID can be edited only by Admin, with reason, audited. Employees can edit their own phone/address.
- Sales can never read any other employee's profile/private data; names of other employees are not exposed.

## 4b. Data that Sales must never receive (API, network tab, CSV, notifications, invoices)
`store_id`, store name/code, full product code (`GZ-…`), `min_price`, other employees' data, bonus/commission rule definitions, audit data, national IDs, profit information.
Enforced by: no table access, security-definer views with an explicit column list, and a dedicated test (section 8).

## 5. Input validation & output
- Zod schemas for **every** server action and route handler; reject unknown keys (`.strict()`).
- Server actions are the only write path from UI; each: authenticate → authorize (role) → validate → call RPC → return `{ok,data|error}`; errors are mapped to safe Arabic messages (no SQL/stack leaks).
- Media uploads (images **and videos**): the server issues the signed upload URL only to an active Admin, after checking counts (≤ 10 images, ≤ 3 videos per product), declared MIME and size (images ≤ 5 MB, videos ≤ 50 MB: MP4/WebM/MOV). After upload the server re-reads the real object metadata and sniffs magic bytes (MP4/MOV `ftyp`, WebM `1A45DFA3`, image signatures); mismatches are deleted. Random file names, private buckets, signed URLs (1 h) for every read. Sales never receive raw storage paths, only signed URLs.
- Import files: size ≤ 2 MB, ≤ 500 rows, parsed server-side with a pinned library version, formulas never evaluated, cells length-limited; reject anything not `.xlsx`/`.csv`.
- CSV export: prefix cells that start with `= + - @` with `'` to prevent CSV/formula injection.
- React escapes output; never use `dangerouslySetInnerHTML` with user data.

## 6. Web hardening (Vercel)
`next.config.js` / middleware headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), a CSP restricting scripts to self (+ Supabase domains for `connect-src`/`img-src`), `Permissions-Policy` minimal. `/print/*` pages are authenticated like all others. Supabase Auth: set exact Site URL and allowed redirect URLs (no wildcards in production).

## 7. Audit
Triggers + RPC-internal inserts only; append-only (REVOKE + trigger); `restricted` visibility for admin-management and security events (Super Admin only). Denied-access attempts caught in RPCs are written as `security.denied`.

## 8. Mandatory security tests (must pass before Phase 6 sign-off)
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

## 9. Operational
- Use Supabase **Pro** on `prod` (daily backups, no pause). Enable PITR if budget allows.
- Rotate keys if ever exposed; never paste secrets into chats, issues or PRs.
- Review audit log weekly (Super Admin).

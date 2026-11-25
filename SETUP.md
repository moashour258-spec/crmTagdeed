# SETUP — what YOU (the owner) must do manually

> **Update:** Cursor now operates GitHub, Supabase and Vercel itself through their CLIs (see `AGENT_OPERATIONS.md`). Sections 6–7 below are executed by Cursor; you only do the one-time CLI logins, the Super Admin password prompt, and the production approvals.

These steps need your accounts and secrets, so only you can do them. **Never paste any secret into Cursor chat, GitHub, issues or this repo.**

## 1. Accounts
- GitHub (private repo), Supabase, Vercel. (No Google Cloud needed: there is no Google sign-in.)
- Supabase **Pro** is recommended for `prod` (daily backups, no pausing).

## 2. Supabase — create two projects
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

## 3. (Removed) Google OAuth
Not used. Login is email + password; accounts are created by an Admin inside the app (invitation email, generated random password, or custom password).

## 4. Environment variables

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

## 5. Branding & company data
- The logo is already in this pack (`public/logo.jpg`, white background) and the brand system is in `BRANDING.md`. Optional later: replace it with an SVG/PNG with transparent background for a crisper sidebar/favicon.
- Company name is **تجديد**. Prepare: address, phone, footer text for receipts/invoices (entered later in Settings).

## 6. Deployment steps
1. Push the repo to GitHub (private). Confirm `.env*` (except `.env.example`) is git-ignored.
2. Link the Supabase CLI: `supabase link --project-ref <dev-ref>` → `supabase db push`. Repeat for prod **only after dev tests pass**.
3. Run the Super Admin seed **once per environment** (locally, with the target project's env vars): `npm run seed:super-admin`. Then delete `SUPER_ADMIN_PASSWORD` from wherever you set it.
4. Vercel: *Import Project* from GitHub → framework Next.js → add env vars → deploy. Production branch = `main`; every PR gets a Preview linked to `dev`.
5. Add your custom domain in Vercel, then update Supabase Site URL/Redirect URLs to that domain.

## 7. Production verification checklist (tick all before go-live)
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

## 8. Things Cursor may ask you for
Domain name, receipt text, confirmation of the *Assumptions* list at the end of `PRD.md`.

## 9. Local sign-off (not production)
The boxes in section 7 stay empty until the app is on the production domain. Local evidence so far:

- Database checks for security tests 1–20 run in `supabase/tests/phase0.sql` through `phase5.sql`, the race scripts, and `supabase/tests/security-signoff.sql`. That last file checks RLS on every public table, anonymous reads, sales writes to money tables, the fourth video, an oversized video, and `service_role` being unable to edit `audit_logs`.
- App checks cover the national ID, renamed media, CSV formula cells, route gates, `getUser()` instead of `getSession()`, and the service-role key staying in `lib/supabase/admin.ts`, `lib/env.ts`, and the seed script.
- `npm audit` on 25 Nov 2026: 1 critical, 4 high, 3 moderate, 1 low. The patched versions that stay on the current Next.js 15 line were not installed because `npm install` failed in this environment (`edgesOut`). Do not jump to Next.js 16 just to clear the audit. `xlsx` has no fixed release; imports stay size-limited and formulas are not evaluated. `zod` should move to `4.6.7` or newer when install works. Vitest's critical advisory is the local UI server, which production does not run.
- There is no committed `supabase/seed.dev.sql`. Reference categories and settings stay in the migrations.
- Auth config keeps sign-up off and the password minimum at 10 characters. Security headers, including the content security policy, are set in `next.config.ts` and `vercel.json`.

Production still needs these exact phrases, one at a time: `APPROVE PROD DB`, then `APPROVE PROD SEED`, then `APPROVE PROD DEPLOY`. Also log in once with `gh auth login`, `supabase login`, and `vercel login`.

# Changelog

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

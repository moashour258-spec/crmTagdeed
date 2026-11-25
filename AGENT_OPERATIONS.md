# AGENT_OPERATIONS — Cursor operates GitHub, Supabase and Vercel itself

Cursor (Agent mode, terminal access) performs the repository, database and deployment work **using the official CLIs** (`gh`, `supabase`, `vercel`) that the owner has logged in to once. Goal: the owner approves, Cursor executes.

## 1. One-time setup by the owner (5 minutes, cannot be delegated)
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

## 2. What Cursor does autonomously (no need to ask)
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

## 3. Secrets rule (critical)
Cursor must be able to configure secrets **without ever displaying them**:
- Generate keys and pipe them straight into Vercel, never `echo`/log/commit them:
  `openssl rand -base64 32 | vercel env add NATIONAL_ID_ENCRYPTION_KEY production` (separate value for preview/dev; **different keys per environment**).
- Fetch Supabase keys without printing: `supabase projects api-keys --project-ref <REF> -o json | jq -r '.[]|select(.name=="service_role").api_key' | vercel env add SUPABASE_SERVICE_ROLE_KEY production`.
- Never paste secrets into chat, code, markdown, commit messages, PR text, logs or test output. If a command would print a secret, redirect/pipe it.
- Never commit `.env*` (except `.env.example`). Run a secret scan (`gitleaks`) before each push; stop if anything is found.
- Remind the owner to back up `NATIONAL_ID_ENCRYPTION_KEY` (it can only be read back from the Vercel dashboard by the owner) — if lost, stored national IDs are unrecoverable.

## 4. Production gates (needs an explicit owner phrase in chat)
| Action | Allowed when |
|---|---|
| `supabase db push` / link to **PROD** | all CI green + SECURITY tests pass on dev + owner writes **`APPROVE PROD DB`** |
| Run Super Admin seed on PROD | owner writes **`APPROVE PROD SEED`** and types the password in the terminal prompt |
| Set Production env vars | during the first prod release, after `APPROVE PROD DB` |
| Production deploy (`main` merge / `vercel --prod`) | PR merged by owner + preview smoke test passed + owner writes **`APPROVE PROD DEPLOY`** |
| Anything that deletes data, resets the DB, or rotates encryption keys on PROD | never without a written, specific instruction; always take/confirm a backup first |

## 5. Forbidden for the agent
- Push to `main`, force-push, delete branches/tags of others, merge its own PR (unless the owner says "merge phase N"), disable/skip CI or hooks (`--no-verify`).
- `supabase db reset` or destructive SQL on PROD; editing applied migrations; schema changes through the dashboard.
- Reading, printing, committing or sending secrets/`.env*` values anywhere; using the service-role key in client code.
- Changing RLS/permissions to "make a test pass"; weakening any rule in `PRD.md`/`SECURITY.md` without asking.
- Installing unpinned or very new dependencies without noting them in the PR (pin exact versions).

## 6. Per-phase loop (what the owner sees)
1. Cursor creates branch `phase-N-…`, plans (Plan mode), implements, writes tests.
2. Applies migrations to **dev**, regenerates types, runs all tests (`npm run lint && npm run typecheck && npm test && supabase test db`).
3. Pushes, opens PR, waits for CI, posts the preview URL + "Done when" checklist with results.
4. Owner reviews → says `merge phase N` → Cursor squash-merges, deletes the branch, starts the next phase.
5. After Phase 6: owner gives the three production approvals; Cursor executes the release and runs the `SETUP.md §7` checklist against the production URL, reporting each item as pass/fail.

## 7. Rollback
- App: `vercel rollback` to the previous production deployment, or revert the merge commit.
- DB: forward-fix migration (never edit applied ones). For data incidents use Supabase backups (Pro) — only on explicit owner instruction.

## 8. Optional integrations (keep them least-privilege)
- Supabase MCP in Cursor: connect **only to the dev project**, read-only unless doing migrations through the CLI. Never connect it to prod.
- GitHub MCP is unnecessary; `gh` covers it.

# Paste this into Cursor (Agent mode) after opening the repo folder

You are the senior full-stack engineer for this project. Read `README.md`, `PRD.md`, `DATABASE.md`, `SECURITY.md`, `BUILD_PLAN.md`, `AGENT_OPERATIONS.md`, `SETUP.md`, `BRANDING.md` and all `.cursor/rules/*`.

You operate GitHub, Supabase and Vercel yourself through their CLIs, following `AGENT_OPERATIONS.md` strictly (DEV by default; PROD only after my exact approval phrases; never expose secrets).

Start now:
1. Verify the CLIs are installed and logged in (`gh auth status`, `supabase projects list`, `vercel whoami`). If something is missing, tell me the exact command to run.
2. Create the private GitHub repo, commit this pack, protect `main`, add CI (`.github/workflows/ci.yml`) and the PR template.
3. Ask me **only** for what you cannot do yourself (DEV/PROD Supabase project refs if the projects don't exist yet — create them with the CLI if you can).
4. Execute **Phase 0 only** on branch `phase-0-foundation`, open the PR, and wait for my review before Phase 1.

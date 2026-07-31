# FlowDesk Realtime

A Codex-ready React + TypeScript frontend for the existing FlowDesk Supabase project. It combines company operations dashboards with Jira-style project delivery.

## What is included

- Google OAuth and email/password authentication
- OAuth callback that does not restart or double-exchange the login flow
- Multi-workspace membership loading without unsafe `.single()` calls
- Atomic first-workspace creation
- CEO, Admin, Manager, Team Lead, Employee and Viewer-aware navigation
- Portfolio dashboard and delivery KPIs
- Projects, owners, dates, priorities and progress
- Jira-style Kanban board with browser-native drag and drop
- Product backlog, sprints, epics, issue types and story points
- Task assignees, reviewers, comments and acceptance criteria
- Time logs, blockers, evidence uploads and approval workflow
- People, departments, teams and capacity
- Reports and CSV export
- Supabase Realtime invalidation across operational tables
- Responsive desktop, tablet and mobile interface
- Additive Supabase migration preserving the existing schema and data

## Important audit findings

The connected Supabase project already contained the core FlowDesk tables and RLS policies. It was not an empty project.

The audit found:

1. Google Auth logs contained `OAuth state not found or expired`. The old callback was likely being processed more than once or OAuth was being restarted from `/auth/callback`.
2. The frontend errors referenced RPCs that did not exist: `add_employee_profile`, `update_task_progress`, `report_task_blocker`, and `submit_task_for_review`.
3. The Supabase Realtime publication was empty, so the old application was not actually realtime.
4. Four test organizations existed, including empty duplicate organizations created without owner memberships. This package does not delete them automatically.
5. Email delivery logs contained SMTP error `525 5.7.1 Unauthorized IP address`.
6. Supabase Security Advisor reported leaked-password protection as disabled.

## 1. Apply the migration

Apply this file to the connected project before running the full frontend:

```text
supabase/migrations/20260729174500_flowdesk_jira_and_rpc_compatibility.sql
```

It is additive. It creates Jira planning tables and fields, the missing RPC functions, atomic workspace onboarding, RLS policies and Realtime publication entries. Existing tables and rows are preserved.

Recommended production workflow:

```bash
supabase link --project-ref pfmsmwynwjpcysmxmyvb
supabase db push
```

For a safer release, apply it first to a Supabase development branch and run UAT before production.

## 2. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Set:

```env
VITE_SUPABASE_URL=https://pfmsmwynwjpcysmxmyvb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_current_supabase_publishable_key
VITE_APP_URL=http://localhost:5173
```

### Required change from the AI Studio project

This is a Vite application. Replace these old variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

with:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Do not put a Supabase service-role key in the frontend.

## 3. Correct Google OAuth configuration

### Google Cloud Console

The authorized redirect URI must be the Supabase callback, not the frontend callback:

```text
https://pfmsmwynwjpcysmxmyvb.supabase.co/auth/v1/callback
```

### Supabase Auth → URL Configuration

Set the production site URL to the final deployed domain.

Add exact redirect URLs for every environment used:

```text
http://localhost:5173/auth/callback
https://your-production-domain.com/auth/callback
```

Keep AI Studio preview URLs only while they are actively used. Remove stale preview URLs before production.

The callback page in this code waits for `detectSessionInUrl: true` to establish the PKCE session. It never calls `signInWithOAuth` or manually exchanges the code again.

## 4. Install and run

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
npm run preview
```

This execution environment could not reach the public npm registry, so dependency installation was not possible here. All TypeScript/TSX files passed syntax transpilation and a local static type check using module shims. Run the normal build after installing dependencies on your computer or in Codex.

## 5. Deployment

The package includes:

- `public/_redirects` for Render/Netlify-style SPA routing
- `vercel.json` for Vercel rewrites

After deployment, update:

1. `VITE_APP_URL`
2. Supabase Site URL
3. Supabase Redirect URLs
4. Google OAuth production origins where required

## 6. Production fixes still required

- Fix or replace the SMTP provider causing the unauthorized-IP error.
- Enable leaked-password protection in Supabase Auth settings.
- Select the canonical organization and manually review empty duplicate test organizations before deleting anything.
- Run browser UAT separately for all six roles.
- Test RLS with two users from different organizations; hidden buttons are not a security boundary.
- Add billing, tenant provisioning limits, audit retention, backups, terms, privacy policy and support processes before selling the product.

## Repository handoff

No FlowDesk repository was accessible through the connected GitHub account during this build. This package is therefore a clean replacement starter, not an in-place patch of the AI Studio code. Upload it to a new repository or copy its `src`, migration and configuration files into the existing repository after reviewing differences.

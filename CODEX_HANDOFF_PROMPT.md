# Codex handoff prompt

Use this prompt after uploading this package to GitHub or opening it in Codex:

```text
You are stabilizing and completing the FlowDesk Realtime SaaS project in this repository.

GOAL
Deliver a production-oriented multi-tenant operations and project-management application using React, TypeScript, Vite and the existing Supabase project. Preserve the current architecture and database data. The interface should feel as polished and configurable as a strong WeWeb dashboard while including Jira-style project delivery.

SUPABASE
Project ref: pfmsmwynwjpcysmxmyvb
Use only:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY
Never use a service-role key in browser code.

FIRST ACTIONS
1. Read README.md completely.
2. Inspect every file before changing architecture.
3. Run npm install.
4. Run npm run build and record all errors.
5. Review supabase/migrations/20260729174500_flowdesk_jira_and_rpc_compatibility.sql.
6. Do not delete or rewrite existing production data.
7. Apply the migration to a Supabase development branch first when branch access is available.

AUTHENTICATION RULES
- Keep Supabase auth flowType: pkce.
- Keep detectSessionInUrl: true.
- Google sign-in redirects to `${window.location.origin}/auth/callback`.
- The callback route must never invoke signInWithOAuth.
- Do not manually call exchangeCodeForSession if the browser client already processes the URL.
- Never process the callback twice.
- Handle callback error, missing session and success explicitly.
- After session success, remove callback query parameters and navigate once.

MULTI-TENANCY RULES
- Supabase is the source of truth.
- RLS is mandatory.
- Never trust hidden UI controls as authorization.
- Every operational query must be scoped by organization_id.
- Membership queries can return zero, one or multiple rows; never use .single() for the membership list.
- Keep the selected workspace explicit in client state.

FEATURES TO VERIFY
- Role-aware dashboards: CEO, Admin, Manager, Team Lead, Employee, Viewer
- Project CRUD
- Kanban board and status movement
- Backlog, sprints, epics, story points and issue types
- Task creation, assignment, reviewer and acceptance criteria
- Comments, time entries, blockers, evidence uploads and approvals
- People, departments, teams and weekly capacity
- Reports and CSV export
- Realtime synchronization across users
- Responsive mobile and desktop layouts

QUALITY GATES
- TypeScript: zero errors
- Production build: pass
- No missing RPC errors
- No OAuth loop or expired-state error under a normal single login attempt
- No duplicate organization from repeated onboarding click
- No query relying on .single() where multiple memberships are valid
- No cross-organization data exposure
- No service-role key in source, browser bundle or logs
- No destructive migration

TEST MATRIX
Test with separate accounts for CEO, Manager, Team Lead, Employee and Viewer. Verify allowed and denied actions for projects, tasks, people, approvals, evidence and reports. Test two organizations to prove tenant isolation. Test Google OAuth from localhost and production callback URLs. Test browser refresh directly on every route.

DELIVERABLES
Return:
1. Root causes found
2. Files changed and reasons
3. Migration result
4. TypeScript result
5. Production build result
6. Role/RLS UAT result
7. Remaining risks that require manual Supabase or Google Console configuration

Do not claim the project is bug-free. Report verified tests and unresolved risk precisely.
```

# Supabase audit summary

Project reference: `pfmsmwynwjpcysmxmyvb`

## Verified existing backend

- Core organizations, memberships, people, projects and task tables exist.
- Task evidence storage bucket and policies exist.
- RLS is enabled across the operational schema.
- Google identities and sessions exist and successful Google logins were present in auth logs.

## Confirmed defects or gaps

- No public RPC functions existed during the audit.
- The previous frontend referenced four missing RPC names.
- An OAuth callback produced `OAuth state not found or expired`.
- The Realtime publication contained no public tables.
- Email delivery produced SMTP `525 5.7.1 Unauthorized IP address`.
- Four test organizations existed; two had no membership rows.
- Leaked-password protection was disabled according to Security Advisor.

## Safe changes included but not automatically applied

- Additive Jira planning schema
- Public compatibility RPC functions with authorization checks
- Atomic and idempotent initial workspace creation
- Realtime publication entries
- RLS policies for all new tables

## Deliberately not automated

- Deleting duplicate organizations
- Replacing SMTP configuration
- Changing Google Cloud OAuth credentials
- Enabling dashboard-level Auth settings
- Applying the migration directly to production without UAT

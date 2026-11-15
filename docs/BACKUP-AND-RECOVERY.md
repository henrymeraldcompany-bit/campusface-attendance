# CampusFace Backup and Recovery Runbook

Last reviewed: 14 November 2026

## 1. Current production baseline

- Supabase project: `CampusFace Attendance`
- Project reference: `rgyhdivtvjkbgantrdpe`
- Plan: Free
- Database engine: PostgreSQL 17
- Status at review: active and healthy
- Application tables: 12 public tables; row-level security is enabled on all 12
- Supabase Auth: 2 staff accounts exist
- Supabase Storage: 0 buckets exist
- Edge Function: `manage-staff`, active version 6; its source is in `supabase/functions/manage-staff/index.ts`
- Biometric processing: disabled (`capture_enabled = false`); keep it disabled unless the institution separately approves and completes the required privacy and security safeguards.

The repository is public. Never commit student/staff records, database exports, Auth exports, passwords, tokens, database connection strings, or encryption passphrases.

## 2. What the automated backup does

The workflow is `.github/workflows/backup.yml`.

Once its two GitHub repository secrets have been configured, it:
1. Runs every day at 02:15 UTC (03:15 Nigeria time). It also runs automatically when the backup workflow file is updated on the main branch, so the first post-fix backup does not require the owner to open Actions and press Run workflow. Manual triggering remains available if needed.
2. Uses the official Supabase CLI to export database roles, the CampusFace public application schema, and its data. The schema and data commands explicitly target the public schema; the CLI also filters out Supabase-managed schemas and extension-owned objects.
3. Checks that all 12 current CampusFace application table definitions are present using a whitespace- and identifier-quote-tolerant parser, then checks that the data export is non-empty. This replaces the previous brittle line-anchored grep checks. The validation recognises both quoted and unquoted PostgreSQL identifiers without modifying the actual SQL dumps.
4. Packages the SQL files and manifest, then encrypts the archive with GPG AES-256.
5. Decrypts the archive in-memory through a pipe to verify that the password works and the archive is readable.
6. Uploads only the encrypted archive as a GitHub Actions artifact with 14-day retention. Plaintext SQL files and the passphrase file are removed before upload.

The repository is public, so artifacts must remain encrypted. Treat the artifact as publicly downloadable ciphertext: use a strong, unique passphrase and keep that passphrase outside GitHub and separate from the downloaded file. A lost passphrase makes the archive unusable. Download important backups and keep an additional copy in a private location; GitHub artifact retention is only 14 days.

### Required GitHub repository secrets

Open the repository's **Settings → Secrets and variables → Actions** and add:

- `CAMPUSFACE_DB_URL`: the PostgreSQL connection string from the Supabase Dashboard's **Connect** panel. Prefer the Session Pooler connection string for a network-friendly connection. Do not put this value in a code file or send it in chat. The latest 15 November 2026 workflow logs show that this saved secret passed validation and authenticated successfully; do not reset or replace it again unless a later log explicitly reports an authentication failure.
- `CAMPUSFACE_BACKUP_PASSPHRASE`: a unique, randomly generated passphrase of at least 24 characters (32 or more is recommended). Generate/store it in a password manager. Do not reuse a website password.

Do not add either value as a GitHub repository variable, commit it to the repository, or paste it into a workflow file.

### Run and retrieve a backup

1. Open the repository's **Actions** tab.
2. Select **CampusFace encrypted database backup**.
3. Choose **Run workflow** and confirm.
4. Open the completed run and find its **Artifacts** section.
5. Download the `campusface-encrypted-db-backup-...` artifact.
6. Keep the encrypted file and its passphrase separately. Do not upload an unencrypted copy to this public repository.

Workflow page: https://github.com/henrymeraldcompany-bit/campusface-attendance/actions/workflows/backup.yml

## 3. Important backup scope and known gaps

The Supabase CLI intentionally excludes Supabase-managed schemas, including `auth` and `storage`, as well as extension-managed objects. This means the current automated artifact is an **application database backup**, not yet a complete one-click copy of the entire Supabase project.

This matters for CampusFace:

- There are currently 2 Auth staff accounts. The `public.staff_profiles.id` values reference Auth user IDs. A new-project restore must preserve or deliberately remap those identities before restoring dependent staff profiles and records. The automated SQL artifact does not include `auth.users` or `auth.identities`.
- Supabase's Auth documentation describes exporting Auth user information by querying the Auth tables from the Dashboard SQL Editor and exporting the results as CSV. Such exports can contain highly sensitive account data. They must be stored encrypted in a private location and must never be committed to this public repository or shared in chat. A tested Auth-account restore procedure is still required.
- There are currently no Storage buckets. If CampusFace later stores files in Supabase Storage, those objects require a separate file backup; a database dump alone does not back up the actual object files.
- The Edge Function source code is version-controlled in this repository, but the deployed function and any custom function secrets/settings must be redeployed or reconfigured after a project rebuild.
- Auth provider settings, email/SMTP settings, redirect URLs, project API keys, and other Dashboard configuration are not contained in the SQL archive.

Official references:
- Supabase database backups: https://supabase.com/docs/guides/platform/backups
- Supabase CLI database dump: https://supabase.com/docs/reference/cli/supabase-db-dump
- Supabase Auth user export: https://supabase.com/docs/guides/auth/managing-user-data
- Supabase Storage object downloads: https://supabase.com/docs/guides/storage/management/download-objects

## 4. Recovery procedure

**Do not run a restore, database reset, or destructive migration against the live CampusFace project as a test.** A restore can replace production data. Use a separate recovery project for rehearsals, and confirm the target project reference before any restore command.

### A. If the website deployment is broken but the database is healthy

1. Open GitHub → Actions and inspect the latest build/deploy run.
2. Use the workflow logs to identify the failed step.
3. Revert the faulty source-code commit to the last known-good commit (create a new revert commit; do not force-push).
4. Confirm the build and deployment workflows pass.
5. Open the PWA in Chrome and verify that an administrator and lecturer can sign in and reach their permitted workspace.

A frontend rollback does not require restoring the database.

### B. If the database is damaged or a project must be rebuilt

1. Stop making changes in the affected system and record the time the problem was discovered.
2. Preserve the encrypted backup artifact and its matching passphrase.
3. Create or select a separate recovery Supabase project. Do not overwrite the current project during a rehearsal.
4. Recreate the required project configuration and extensions. The source migrations and Edge Function are in this repository.
5. Restore Auth users or complete the approved user-ID remapping plan first. Do not blindly import `data.sql` into a new empty project: staff-profile foreign keys depend on Auth IDs.
6. Restore the custom database schema and application data in the correct order, preserving the RLS policies, functions, triggers, constraints, and relationships. Review the generated SQL before executing it.
7. Redeploy `manage-staff`, restore any required Edge Function secrets/settings, and configure Auth URLs/providers.
8. Verify staff access, lecturer course assignments, course enrolments, session snapshots, attendance records, and reports. Confirm RLS is enabled and run the Supabase security/performance advisors.
9. Only switch the live application to a recovered project after the recovery test passes and the administrator has explicitly approved the cutover.

Do not run `supabase db reset --linked` against production. That command is destructive.

## 5. Recovery verification checklist

A recovery rehearsal is only complete when all of the following pass on the isolated recovery project:

- [ ] Expected tables, indexes, constraints, and functions exist.
- [ ] All application relationships are intact, including staff-to-Auth references.
- [ ] RLS is enabled on every exposed application table and the intended policies are present.
- [ ] An administrator can sign in and manage staff/courses.
- [ ] A lecturer can sign in and sees only assigned courses.
- [ ] Existing course enrolments and attendance history are present and internally consistent.
- [ ] Reports and CSV exports match the restored attendance records.
- [ ] The `manage-staff` Edge Function is active and tested.
- [ ] Biometric processing remains disabled unless separately approved.
- [ ] No student/staff data or secrets were exposed in repository files or workflow logs.

## 6. Current Task 16 completion status

- [x] Confirmed the Supabase Free plan has no automatic daily database backups.
- [x] Inspected the live database inventory, RLS status, Auth account count, Storage bucket count, and Edge Function deployment.
- [x] Added an encrypted scheduled/manual application-database backup workflow.
- [x] Added this operational recovery guide.
- [x] Add the two required GitHub Actions secrets and confirm the workflow can validate them and connect to PostgreSQL.
- [ ] Run the first real backup and confirm the artifact is generated.
- [ ] Download and retain a private copy of the encrypted artifact.
- [ ] Establish the separate Auth-user backup/restore method.
- [ ] Perform a full restore rehearsal on a separate project.

Until the remaining checks are completed, consider Task 16 **partially implemented, not fully recovery-tested**.


### Troubleshooting note — 15 November 2026

The latest failed backup attempts were inspected directly from their GitHub Actions logs. The current saved secrets passed validation, and the Supabase CLI successfully connected to PostgreSQL and completed the roles, schema, and data dump commands. The run then failed at the old table-name text check, before encryption and artifact upload. This was a workflow validation defect, not a password failure. One earlier attempt did show a PostgreSQL password-authentication failure, but the more recent runs authenticated successfully.

The workflow has since been revised to:
- automatically run when `.github/workflows/backup.yml` is updated on `main`, avoiding another manual Run workflow step for the first post-fix attempt;
- explicitly dump only the `public` application schema and data;
- use quote- and whitespace-tolerant SQL validation for the 12 application tables;
- clean up plaintext temporary files even if a step fails.

The first successful encrypted artifact is still pending verification. Do not ask the owner to replace the currently working connection secret based solely on the earlier failures.

# CampusFace Attendance

A lecturer-only university attendance management Progressive Web App (PWA), designed to run in Chrome and other supported browsers and install as a standalone web app.

## Access model

- Only authorised lecturers and administrators may sign in.
- Students do not have accounts, login pages, dashboards, or self-registration.
- Staff access requires a matching, active row in `public.staff_profiles`; profile roles cannot be edited by ordinary signed-in users.
- Lecturers manage student records, course enrolments, attendance sessions, and reports.

## Current development status

- Task 1: React, TypeScript, Vite and repository foundation.
- Task 2: responsive lecturer web interface, persistent light/dark theme, and accent-colour settings.
- PWA: Vite PWA plugin generates the web app manifest and service worker; browser installation uses the native install prompt.
- Task 3: Supabase email/password sign-in is connected to the staff profile table. Only active lecturer and administrator profiles can enter the workspace.
- Task 4: the course catalogue is stored in PostgreSQL, includes the nine starter courses, and is managed by administrators. Active courses are supplied from Supabase to the registration course picker and attendance course selector. RLS permits active staff to read active courses and active administrators to add, rename, activate, or deactivate courses.
- Task 5: student registration saves student academic details and course enrolments transactionally in PostgreSQL. Registration numbers are unique without regard to case or surrounding spaces. Student records and enrolments are protected by RLS and are visible only to active authorised staff. Students do not receive Auth accounts.
- Settings: appearance preferences are presented on a full Settings page for all staff. It includes a Back to workspace control, administrator-only academic controls, and a sign-out confirmation at the bottom of the Account section.
- Task 6: authorised staff can edit student academic details and course enrolments, and archive/reactivate student records without permanently deleting them. Updates to student details and course enrolments are transactional. Archived records remain available for historical continuity.
- Task 7 (readiness phase): each student directory entry opens a face-registration readiness page. A server-controlled biometric gate is created with capture disabled by default. Staff can read the gate, but browser users cannot enable it. The page lists institutional approval, DPIA, lawful basis, informed consent, retention/deletion, security review and a non-biometric alternative as prerequisites. This release does not request camera access, capture face images, create templates or upload biometric data.
- Actual face capture and recognition remain disabled until the institution completes and documents the required safeguards.
- Task 8: authorised staff can start class attendance sessions with a course, class title, class date and start time. Starting a session atomically saves a fixed snapshot of all currently active students enrolled in that course. Later changes to student details or course enrolments do not alter the snapshot. Direct browser writes to session or snapshot tables are denied; session creation is performed through a staff-checked database function.
- Task 10: authorised staff can mark a student present only from that session's saved eligible-student snapshot, after manually checking the student's university identity document and physical presence. Attendance is unique per session/student pair; repeated marks return an already-recorded response. Present marks are read-only to browser clients; creation is validated by a staff-checked function and RLS. Students not in the session snapshot cannot be marked. Pending students are not treated as finally absent until the session is ended.
- Task 9 (identification groundwork): each saved attendance session opens its immutable eligible-student snapshot, searchable by student name, registration number, faculty and department. The roster reads the stored session snapshot, not live student enrolments. The biometric-processing gate remains locked, so this page does not request camera access or perform face recognition.
- Staff access verification has a bounded timeout and retry path. The app avoids repeating profile lookups when Supabase refreshes an access token for the same user; the signed-in session is preserved for transient verification failures.
- Task 11: authorised lecturers and administrators can permanently end accessible active sessions. The database assigns the end time, prevents reopening and blocks further attendance marks. Ended sessions show final present/absent lists and attendance percentage from the fixed roster snapshot and immutable marks; reports are available from session history. PDF/CSV export is a separate next task.
- Task 12: ended sessions can be exported as CSV with session details, attendance totals and one row per student. A print-ready report includes the class summary plus separate present and absent lists; Chrome's Print screen can save it as a PDF. The export uses the final saved session snapshot and attendance records. Face scanning remains unimplemented and disabled; attendance verification is manual only.
- Task 13: all 12 public application tables have Row Level Security enabled; unauthenticated roles have no table grants, and exposed RPC execution is restricted. The session-creation endpoint is an invoker-only public wrapper around a permission-checked helper in the private schema. The frontend contains only the Supabase publishable key, not a service-role or secret key. Supabase Auth leaked-password protection is a paid-plan dashboard feature and is not enabled on the current project plan.
- Task 14: automated regression tests cover attendance totals from the immutable session roster, zero/partial/full attendance, exclusion of marks outside the saved roster, CSV cell quoting and formula-prefix neutralisation, and safe report filenames. Both the build check and deployment workflow run the tests before building or publishing.
- Task 15: Playwright browser acceptance tests verify the staff-only sign-in screen, absence of public sign-up, password show/hide control, password-reset navigation, narrow-phone layout, and the generated PWA manifest/service worker. Tests use an isolated browser session and synthetic text only; they do not use real staff credentials, send password-reset emails or access student records. Both CI workflows run browser tests against the production build before release.
- Task 16 (backup/recovery foundations): added a daily/manual GitHub Actions workflow that exports custom database roles, schema and application data, checks the 12 CampusFace tables, encrypts the archive with GPG AES-256, and stores only the encrypted artifact for 14 days. The workflow requires `CAMPUSFACE_DB_URL` and `CAMPUSFACE_BACKUP_PASSPHRASE` repository secrets. Supabase Free has no automatic daily database backups, and Supabase CLI dumps exclude managed Auth and Storage schemas. A full Auth-user recovery method, first real encrypted backup, and isolated full-restore rehearsal are still outstanding. See [Backup and Recovery Runbook](docs/BACKUP-AND-RECOVERY.md).\n- Staff accounts must be provisioned by a trusted administrator; the app has no public sign-up or student login.

## Main application areas

The two main workspace tabs are **Registration** and **Attendance**. A full-page **Settings** area is available to all staff. The **Course catalogue** is available to administrators from Settings. Faculty/department management and staff administration are available to administrators from Settings.

## Technology

- React + TypeScript + Vite
- `vite-plugin-pwa` for the manifest, service worker, offline app shell and automatic updates
- Browser-native installation: Chrome's **Install app** action launches CampusFace as a standalone web app; no APK or native Android wrapper is required.
- Supabase Auth and PostgreSQL are connected for staff authentication. The browser uses the project publishable key and Row Level Security; service-role credentials are never included in the frontend.
- Browser-based face processing will use a separately selected, licensed and evaluated model (not configured yet).

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Run regression tests, then build and typecheck:

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## Website and installation

The website is published at:

`https://henrymeraldcompany-bit.github.io/campusface-attendance/`

Open it in Google Chrome. Use the website's **Install app** button or Chrome's menu → **Install app**. The app is installed by the browser as a standalone web app when the browser/device supports PWA installation. Do not use **Create shortcut** or **Add to Home screen** as substitutes.

## Privacy and safety

Biometric information is sensitive personal data. Do not commit student records, face images, biometric templates, credentials, API keys or real attendance data to this repository. Before any real deployment, obtain institutional approval, establish a lawful basis and appropriate consent process, complete a privacy impact assessment, define retention and deletion rules, and test security and recognition accuracy. Uncertain face matches must be referred for human verification rather than automatically recorded.

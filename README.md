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
- Faculty/department catalogue administration, camera capture and attendance processing are still under development.
- Staff accounts must be provisioned by a trusted administrator; the app has no public sign-up or student login.

## Main application areas

The two main workspace tabs are **Registration** and **Attendance**. A full-page **Settings** area is available to all staff. The **Course catalogue** is available to administrators from Settings. Faculty/department management and staff administration will be implemented separately.

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

Build and typecheck:

```bash
npm run build
```

## Website and installation

The website is published at:

`https://henrymeraldcompany-bit.github.io/campusface-attendance/`

Open it in Google Chrome. Use the website's **Install app** button or Chrome's menu → **Install app**. The app is installed by the browser as a standalone web app when the browser/device supports PWA installation. Do not use **Create shortcut** or **Add to Home screen** as substitutes.

## Privacy and safety

Biometric information is sensitive personal data. Do not commit student records, face images, biometric templates, credentials, API keys or real attendance data to this repository. Before any real deployment, obtain institutional approval, establish a lawful basis and appropriate consent process, complete a privacy impact assessment, define retention and deletion rules, and test security and recognition accuracy. Uncertain face matches must be referred for human verification rather than automatically recorded.

# CampusFace Attendance

A lecturer-only university attendance management Progressive Web App (PWA).

## Access model

- Only authorised lecturers and administrators may sign in.
- Students do not have accounts, login pages, dashboards, or self-registration.
- Lecturers manage student records, course enrolments, attendance sessions, and reports.

## Current development status

- Task 1: React, TypeScript, Vite and repository foundation.
- Task 2: responsive lecturer interface and PWA installability configuration.
- The visible interface is a preview. Authentication, database writes, real student records, camera capture and attendance processing are not connected yet.

## Main application areas

The two main workspace tabs are **Registration** and **Attendance**. Academic settings and staff permissions are grouped under a restricted settings menu and will require administrator access.

## Planned technology

- React + TypeScript + Vite
- PWA manifest, service worker and update handling via `vite-plugin-pwa`
- Supabase for authentication, database and server-side access policies (to be configured)
- Browser-based face processing using a separately selected, licensed and evaluated model (not configured yet)

## Local development

Requirements: Node.js 20.19+ and npm.

```bash
npm install
npm run dev
```

Run the production typecheck and build with:

```bash
npm run build
```

## Deployment

The project is configured for GitHub Pages at:

`https://henrymeraldcompany-bit.github.io/campusface-attendance/`

The repository's `.github/workflows/deploy.yml` workflow builds and publishes the PWA when GitHub Pages is configured to use **GitHub Actions** in repository Settings → Pages.

## Privacy and safety

Biometric information is sensitive personal data. Do not commit student records, face images, biometric templates, credentials, API keys or real attendance data to this repository. Before any real deployment, obtain institutional approval, establish a lawful basis and appropriate consent process, complete a privacy impact assessment, define retention and deletion rules, and test security and recognition accuracy. Uncertain face matches must be referred for human verification rather than automatically recorded.

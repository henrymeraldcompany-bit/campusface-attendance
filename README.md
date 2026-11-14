# CampusFace Attendance

A lecturer-only university attendance management Progressive Web App (PWA), designed to run in Chrome and other supported browsers and install as a standalone web app.

## Access model

- Only authorised lecturers and administrators may sign in.
- Students do not have accounts, login pages, dashboards, or self-registration.
- Lecturers manage student records, course enrolments, attendance sessions, and reports.

## Current development status

- Task 1: React, TypeScript, Vite and repository foundation.
- Task 2: responsive lecturer web interface, persistent light/dark theme, and accent-colour settings.
- PWA: Vite PWA plugin generates the web app manifest and service worker; browser installation uses the native install prompt.
- The visible interface is still a preview. Authentication, database writes, real student records, camera capture and attendance processing are not connected yet.

## Main application areas

The two main workspace tabs are **Registration** and **Attendance**. Academic settings and staff permissions are grouped under a restricted settings menu and will require administrator access.

## Technology

- React + TypeScript + Vite
- `vite-plugin-pwa` for the manifest, service worker, offline app shell and automatic updates
- Browser-native installation: Chrome's **Install app** action launches CampusFace as a standalone web app; no APK or native Android wrapper is required.
- Supabase is planned for authentication, database and server-side access policies (not configured yet).
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

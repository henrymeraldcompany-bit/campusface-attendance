# CampusFace Attendance

A lecturer-only university attendance management Progressive Web App (PWA).

## Access model

- Only authorised lecturers and administrators may sign in.
- Students do not have accounts, login pages, dashboards, or self-registration.
- Lecturers manage student records, course enrolments, attendance sessions, and reports.

## Planned technology

- React + TypeScript + Vite
- Supabase for authentication, database, and server-side access policies (to be configured)
- Browser-based face processing using a separately selected, licensed, and evaluated model (not configured yet)

## Development status

The initial React, TypeScript, and Vite foundation is being established. Application features will be added in small, verified stages.

## Privacy and safety

Biometric information is sensitive personal data. Do not commit student records, face images, biometric templates, credentials, API keys, or real attendance data to this repository. Before any real deployment, obtain the institution's approval, establish a lawful basis and appropriate consent process, complete a privacy impact assessment, define retention/deletion rules, and test security and recognition accuracy. Uncertain face matches must be referred for human verification rather than automatically recorded.

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

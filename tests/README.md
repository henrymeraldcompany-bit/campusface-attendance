# Automated tests

Run the regression suite with:

```bash
npm test
```

The suite currently covers the pure attendance-report rules:

- Empty, all-absent, partial and all-present session summaries.
- Attendance counts and percentages based only on the session's saved eligible-student roster.
- CSV escaping for commas, quotes and line breaks.
- Neutralising spreadsheet formula prefixes in exported text.
- Safe, accent-normalised and length-limited report filename segments.

Run the browser acceptance suite against the production build with:

```bash
npm run build
npx playwright install chromium
npm run test:e2e
```

The Playwright suite starts Vite's production preview on the GitHub Pages base path and checks the staff entry experience and installable PWA files in Chromium. It uses synthetic input only. It never signs in, sends password-reset emails, or accesses student records.

These automated tests are not a substitute for a supervised live acceptance test of authorised lecturer workflows against the configured Supabase project. Do not put real credentials or student data into test fixtures.

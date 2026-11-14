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

These are automated unit tests, not a substitute for a live lecturer acceptance test against the configured Supabase project. Do not use real student data in test fixtures.

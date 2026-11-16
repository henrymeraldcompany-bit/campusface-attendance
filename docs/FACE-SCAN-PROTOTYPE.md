# Face scanner prototype — synthetic demonstration only

## Scope of this branch

This branch adds a small, isolated preview of the future scanner response states. It is deliberately **not** a face scanner and is not connected to production attendance marking.

The preview supports three fixed scenarios:

- **Synthetic candidate preview:** shows how a possible candidate could be presented for staff verification.
- **Manual review required:** demonstrates that an uncertain result must not be treated as a verified identity.
- **No demo match:** shows the safe path when no candidate is returned.

All samples are invented labels. They are not students and are not linked to student records.

## Explicitly not implemented

- No camera permission request or camera stream.
- No photo upload, image capture, face detection or face embedding.
- No ONNX Runtime or recognition model dependency.
- No reading or writing biometric data in Supabase.
- No automatic attendance mark or call to `mark_student_present`.
- No change to the production biometric gate or attendance schema.

The feature flags in `src/biometrics/face-scan-prototype.ts` are deliberately fixed to `false`.

## How to verify

Run:

```bash
npm test
npm run build
```

The focused unit tests verify that the sample outputs remain synthetic, uncertainty routes to manual review, no-match returns no identity, and no scenario records attendance.

## Requirements before any real biometric implementation

A real implementation is a separate project stage. It must not be enabled merely because this demo works. Before real student biometric processing, the institution must document its approval, DPIA, lawful basis, informed consent process, retention/deletion rules, security review and practical non-biometric alternative. The current production gate is disabled and must remain disabled.

Any future recognition candidate must be subject to human identity verification; an uncertain or failed scan must never create a present mark. The existing manual process remains the production path.

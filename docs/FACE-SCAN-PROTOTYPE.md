# Phone face scanning and attendance

## Current implementation

The feature branch adds a phone-camera face workflow and a Supabase-backed enrollment/matching service.

- Administrators can open a student's **Face scan** action from the student directory.
- The student's age category and institution-held consent reference are recorded before enrollment.
- The lecturer's HTTPS phone browser opens the rear camera only after the staff member taps the camera button.
- Face landmarks and the 128-value SFace feature are generated on the phone.
- Only the feature vector is sent to the authenticated Edge Function; the camera video and source photograph are not uploaded or stored.
- Supabase Vault holds the AES-256-GCM encryption key. The browser cannot read that key or the face template table.
- Attendance matching is limited to the saved roster for the active session and students with active consent and an enrolled template.
- A candidate is not an attendance mark. The lecturer must check the student's identity in person and explicitly confirm before the server writes attendance.
- An uncertain/no match, an unavailable scanner, or a student who uses the alternative route stays on the existing manual process.

## Institution and individual consent

The institution-level approval and DPIA reference fields were removed from the runtime gate after the user confirmed that institutional approval and DPIA review had been completed. The processing gate is enabled with an administrator and timestamp recorded in Supabase.

Individual consent is still required. The enrollment endpoint requires:
- a recorded consent reference;
- a consent document version;
- selection of the student's age category;
- parent/guardian consent authority for a student under 18, or the student's own consent for an adult.

Only the consent reference is stored. The app does not accept or store signatures or identity documents.

## Security model

- Face templates are encrypted server-side with AES-256-GCM before they are stored in the private table.
- The encryption key is held in Supabase Vault and retrieved only through a service-role-only database function.
- RLS is enabled on biometric tables; browser roles have no direct access to templates, match tickets or audit records.
- The Edge Function verifies the signed-in staff identity, active staff role, session ownership/administrator access and active session status.
- Matching only considers consented templates for students in that session's immutable enrolment snapshot.
- Match tickets are single-use and short-lived.
- The existing manual attendance method remains available.
- No automatic attendance is performed solely from a model similarity result.

## Model and limitations

The browser uses MediaPipe Face Landmarker for landmarks and the OpenCV SFace model for a 128-value feature. The matching threshold uses OpenCV SFace's reference cosine threshold of 0.363. It has not been independently calibrated for this institution's student population, phones, camera distances or lighting. False matches and missed matches are possible.

The current workflow is one face at a time. Robust presentation-attack/liveness detection has not been implemented. A photo or replay may produce a candidate; this is why in-person staff confirmation remains mandatory. No claim of perfect recognition or fully certified accuracy is made.

## Verification

Run:

```bash
npm test
npm run build
npm run test:e2e
```

The feature branch's GitHub Actions workflow runs regression tests, the TypeScript/Vite build and Playwright browser checks. Real-device camera permission, model download, thermal/battery performance and accuracy still require testing on the supported lecturer phones before a wider rollout.

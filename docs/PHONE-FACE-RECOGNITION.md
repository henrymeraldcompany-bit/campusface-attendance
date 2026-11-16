# CampusFace phone face-scanning implementation

## Current integration state — 16 November 2026

- The student directory action is **Face scan** and opens the selected student's camera-enrollment screen directly. The previous review-readiness checklist is no longer displayed.
- Institutional activation is enabled in Supabase. The biometric gate has an approval timestamp and an approving active administrator recorded.
- The AES-256-GCM template key is stored in Supabase Vault. The biometric Edge Function retrieves it through a service-role-only database function; it is not exposed to the browser.
- The separate `face-biometric` Edge Function is deployed with JWT verification. The existing `manage-staff` function is unchanged.
- The biometric tables currently contain no student templates. The end-to-end camera and model pipeline still needs a supervised real-phone test before relying on attendance results.
- The phone camera, MediaPipe landmarking, SFace embedding, gated Supabase Edge Function, encrypted template tables and confirmed-attendance path are merged into `main` and deployed.
- The biometric gate is enabled by an administrator attestation. This runtime flag is not a substitute for maintaining the institution-held approval and DPIA records.
- The biometric tables were empty when the latest backend inspection was run. A supervised phone test is still required.

## How enrollment works

1. An administrator selects **Face scan** beside an active student.
2. The administrator records the student's age category, the institution-held consent reference and the consent document version.
3. The lecturer/administrator records consent metadata before camera access is enabled, then selects the front or rear camera. The HTTPS phone browser requests camera permission.
4. The phone checks that exactly one face is visible, finds face landmarks and computes a 128-value SFace feature locally.
5. Only that numerical feature is sent to the authenticated Supabase Edge Function. Camera video and source photographs are not uploaded or stored.
6. The server encrypts the feature with AES-256-GCM and stores the encrypted template in the private table.

For a student under 18, the consent authority must be a parent or legal guardian. Adult students must have their own consent recorded. The institution's non-biometric attendance option must remain available.

## How attendance matching works

- The lecturer uses the scanner on an active class session.
- A captured face feature is compared only against consented templates belonging to students in that session's saved enrolment snapshot.
- A clear candidate is returned with a short-lived, single-use confirmation ticket.
- The lecturer checks the student's identity in person and confirms the candidate. Only then does the server write a `face_confirmed` attendance record.
- An uncertain result, no match, unavailable camera or student choosing the alternative route uses the existing manual process.
- Matching by itself never marks attendance and duplicate session/student records are prevented.

## Security controls

- AES-256-GCM encryption is performed server-side before a template is stored.
- The encryption key is held in Supabase Vault and is retrieved only by a service-role-only RPC.
- Biometric tables have Row Level Security enabled; browser roles cannot read templates or match tickets directly.
- The Edge Function checks the authenticated staff profile, role, active status, session ownership/administrator access, session status, consent and session roster.
- Match tickets expire and can only be consumed once.
- Audit events record the workflow without saving camera images or raw feature vectors.

## Model, threshold and known limits

- Face landmarks: MediaPipe Face Landmarker. SFace feature model: OpenCV `face_recognition_sface_2021dec.onnx` (128 values). Its published SHA-256 is `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`. The browser verifies this checksum before loading the model.
- The current matching threshold is OpenCV SFace's reference cosine threshold of `0.363`. It has not been independently calibrated for this institution's student population, phones, camera distances or lighting. False matches and missed matches are possible.
- Robust presentation-attack/liveness detection is not implemented. A photograph or replay could produce a candidate, so the lecturer must perform an in-person identity check before confirming attendance.
- Only one face at a time is supported. Group scanning is not implemented.
- First-time model loading requires internet access. Browser camera access requires HTTPS and explicit browser permission.
- This release also tests and fixes Bearer-token parsing in the biometric Edge Function.
- Passing CI verifies code compilation, regression tests and browser acceptance tests; it does not certify face accuracy, fairness, liveness detection or camera performance on every phone.

## Release checks

Run `npm test`, `npm run build` and `npm run test:e2e`. Before relying on attendance results, complete a supervised real-phone test with synthetic/non-production records first, then a documented institution-approved validation process. Keep manual verification available throughout.
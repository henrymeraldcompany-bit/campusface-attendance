# Phone face-recognition attendance implementation

## Current release state

This feature is on the feature/phone-face-recognition branch and in draft pull request #3. It is not merged into main, and the live GitHub Pages site has not been updated.

The Supabase migration 20261116120000_add_phone_face_recognition has been applied to the connected project. The separate face-biometric Edge Function is deployed with JWT verification. The existing manage-staff function was not replaced.

**Real biometric processing remains disabled.** The live biometric_processing_gate row has no recorded governance references and capture_enabled=false. The server also fails closed if either server secret below is missing.

## What the branch adds

- Rear-camera access from the lecturer's HTTPS phone browser/PWA, started only after an explicit button press.
- On-device face landmarks and a 128-number SFace feature vector. No camera video or still photograph is sent to Supabase.
- An administrator-only enrollment endpoint that records a minimal consent reference and stores the feature vector using AES-256-GCM encryption.
- Matching restricted to students in the active class's saved enrolment snapshot who have an active consent record and enrolled template.
- A short-lived, single-use confirmation ticket. A match is a candidate only; the lecturer must check the student in person and confirm before attendance is recorded.
- Manual attendance remains available for no-match, ambiguous, unavailable, or declined biometric cases.
- Audit events without face images or feature vectors.

## Runtime configuration required before a controlled pilot

Set these as Supabase Edge Function secrets, never in src/, GitHub Pages configuration, browser storage, or a checked-in .env file:

- FACE_TEMPLATE_ENCRYPTION_KEY: base64 encoding of a newly generated 32-byte random key. Keep a protected recovery copy with the institution's authorised security administrator. Losing this key makes stored templates unreadable.
- FACE_MATCH_MIN_COSINE: a cosine similarity threshold selected only after evaluating this exact model and preprocessing pipeline using an institution-approved, representative, consented validation set. The function deliberately has no default threshold. Its accepted numeric range is 0.363–0.95; that range is a safety check, not a recommendation. Do not simply choose the lower bound.

The application cannot set or read Edge Function secrets. The project owner must configure them in Supabase's Edge Function secret settings.

## Governance gate

The endpoint verifies all of the following before enrollment or matching:
- institutional approval reference;
- completed DPIA reference;
- documented lawful basis and purpose;
- consent-process reference;
- retention/deletion/withdrawal policy reference;
- security-review reference;
- non-biometric alternative reference;
- approval timestamp and approving staff profile;
- capture_enabled=true.

The institution-level approval and DPIA references are no longer presented as per-student readiness blockers. If any participant is under 18, the enrollment endpoint still requires the parent/guardian consent authority to be selected and the supporting consent-record reference entered. The app stores the reference, not the consent document itself.

## Model and third-party notes

- Face feature model: OpenCV SFace face_recognition_sface_2021dec.onnx; downloaded from the OpenCV model repository and checked against SHA-256 0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79.
- The model directory publishes an Apache-2.0 license. Verify institutional usage and training-data provenance concerns before production deployment.
- Face landmarks: Google MediaPipe Face Landmarker. Frames are processed on-device, but the MediaPipe Tasks library may send technical performance/usage metrics to Google. This is disclosed in the camera UI and must be included in the institution's privacy notice.
- ONNX Runtime Web runs feature extraction in the browser using WebAssembly. Camera access requires a secure HTTPS context and user permission.

## Known limitations — not production certified

- There is no robust presentation-attack/liveness detection. A photo or replay could produce a face feature. The screen therefore never marks a student automatically; the lecturer must do an in-person identity check.
- The cosine threshold is the OpenCV SFace reference threshold and has not been calibrated against this institution's students/devices/lighting. False accepts and false rejects are possible; lecturer confirmation is mandatory.
- Group recognition is not implemented. The camera requires exactly one visible face per capture.
- Browser model downloads require internet access the first time. Local model caching may help subsequent use, but offline first-run is not guaranteed.
- The complete build, browser tests, real-device performance and fairness/accuracy evaluation must pass before any controlled pilot.
- A scheduled retention purge for expired match tickets and a formal template-retention job should be reviewed before pilot release.

## Rollout checklist

1. Verify and record institutional governance references in the database.
2. Configure the two Edge Function secrets in Supabase.
3. Run code review and CI; fix all failures.
4. Test with synthetic fixtures first, then an institution-approved consented validation group under supervision.
5. Measure false-match and missed-match rates across supported phones and environmental conditions; select a justified threshold.
6. Verify guardian consent and non-biometric alternatives where applicable.
7. Complete real-phone tests, security review, deletion/withdrawal tests and backup/key-recovery tests.
8. Only then should the authorised institution administrator enable the processing gate and approve a controlled pilot.
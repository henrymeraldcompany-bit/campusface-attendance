export type SyntheticScanScenario =
  | "clear-candidate"
  | "uncertain-candidate"
  | "no-match";

export type SyntheticScanOutcome =
  | "candidate-preview"
  | "manual-review-required"
  | "no-demo-match";

export type SyntheticScanResult = {
  source: "synthetic-demo";
  scenario: SyntheticScanScenario;
  outcome: SyntheticScanOutcome;
  sampleLabel: string | null;
  explanation: string;
  manualVerificationRequired: true;
  attendanceWritePerformed: false;
};

/**
 * This branch contains a UI-only demonstration, not a biometric scanner.
 * These constants deliberately remain false until a separately approved
 * implementation is designed, reviewed and tested.
 */
export const FACE_CAPTURE_IMPLEMENTED = false as const;
export const FACE_RECOGNITION_MODEL_INSTALLED = false as const;
export const AUTOMATIC_ATTENDANCE_FROM_SCAN_ENABLED = false as const;

/**
 * Produces fixed demonstration outcomes. It does not read a camera, accept
 * image data, call a model, access student records or write to Supabase.
 */
export function simulateSyntheticFaceScan(
  scenario: SyntheticScanScenario,
): SyntheticScanResult {
  switch (scenario) {
    case "clear-candidate":
      return {
        source: "synthetic-demo",
        scenario,
        outcome: "candidate-preview",
        sampleLabel: "SYNTHETIC SAMPLE A",
        explanation:
          "Illustrative candidate only. A staff member would still need to verify the student's identity in person.",
        manualVerificationRequired: true,
        attendanceWritePerformed: false,
      };

    case "uncertain-candidate":
      return {
        source: "synthetic-demo",
        scenario,
        outcome: "manual-review-required",
        sampleLabel: "SYNTHETIC SAMPLE B",
        explanation:
          "The demonstration result is uncertain. Do not identify or mark anyone from an uncertain result; use the approved manual process.",
        manualVerificationRequired: true,
        attendanceWritePerformed: false,
      };

    case "no-match":
      return {
        source: "synthetic-demo",
        scenario,
        outcome: "no-demo-match",
        sampleLabel: null,
        explanation:
          "No sample was returned in this demonstration. Continue with the approved manual identity-verification process.",
        manualVerificationRequired: true,
        attendanceWritePerformed: false,
      };
  }
}

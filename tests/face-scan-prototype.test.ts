import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_ATTENDANCE_FROM_SCAN_ENABLED,
  FACE_CAPTURE_IMPLEMENTED,
  FACE_RECOGNITION_MODEL_INSTALLED,
  simulateSyntheticFaceScan,
} from "../src/biometrics/face-scan-prototype";

describe("synthetic face scanner prototype", () => {
  it("keeps camera capture, model installation and automatic marking disabled", () => {
    expect(FACE_CAPTURE_IMPLEMENTED).toBe(false);
    expect(FACE_RECOGNITION_MODEL_INSTALLED).toBe(false);
    expect(AUTOMATIC_ATTENDANCE_FROM_SCAN_ENABLED).toBe(false);
  });

  it("returns a clearly labelled synthetic candidate preview", () => {
    const result = simulateSyntheticFaceScan("clear-candidate");

    expect(result.source).toBe("synthetic-demo");
    expect(result.outcome).toBe("candidate-preview");
    expect(result.sampleLabel).toBe("SYNTHETIC SAMPLE A");
    expect(result.manualVerificationRequired).toBe(true);
    expect(result.attendanceWritePerformed).toBe(false);
  });

  it("routes an uncertain synthetic scenario to manual review", () => {
    const result = simulateSyntheticFaceScan("uncertain-candidate");

    expect(result.outcome).toBe("manual-review-required");
    expect(result.sampleLabel).toBe("SYNTHETIC SAMPLE B");
    expect(result.manualVerificationRequired).toBe(true);
    expect(result.attendanceWritePerformed).toBe(false);
    expect(result.explanation).toContain("uncertain");
  });

  it("does not invent an identity when the synthetic scenario has no match", () => {
    const result = simulateSyntheticFaceScan("no-match");

    expect(result.outcome).toBe("no-demo-match");
    expect(result.sampleLabel).toBeNull();
    expect(result.manualVerificationRequired).toBe(true);
    expect(result.attendanceWritePerformed).toBe(false);
  });

  it("marks every output as synthetic and never reports an attendance write", () => {
    const scenarios = [
      "clear-candidate",
      "uncertain-candidate",
      "no-match",
    ] as const;

    for (const scenario of scenarios) {
      const result = simulateSyntheticFaceScan(scenario);
      expect(result.source).toBe("synthetic-demo");
      expect(result.attendanceWritePerformed).toBe(false);
    }
  });
});

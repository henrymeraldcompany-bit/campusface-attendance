import { useState } from "react";
import { Camera, ShieldAlert, UserRound } from "lucide-react";
import {
  simulateSyntheticFaceScan,
  type SyntheticScanResult,
  type SyntheticScanScenario,
} from "./face-scan-prototype";

const SCENARIOS: Array<{
  value: SyntheticScanScenario;
  label: string;
}> = [
  { value: "clear-candidate", label: "Preview candidate" },
  { value: "uncertain-candidate", label: "Preview uncertain result" },
  { value: "no-match", label: "Preview no match" },
];

export function SyntheticFaceScanDemo() {
  const [result, setResult] = useState<SyntheticScanResult | null>(null);

  const runScenario = (scenario: SyntheticScanScenario) => {
    setResult(simulateSyntheticFaceScan(scenario));
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">SCANNER WORKFLOW / SYNTHETIC DEMO</div>
          <h2>Preview scanner responses</h2>
          <p>
            Explore the future screen flow with fixed demonstration outcomes.
            This preview is not connected to the student record above.
          </p>
        </div>
        <Camera size={21} aria-hidden="true" />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "9px",
          marginBottom: "17px",
        }}
      >
        {SCENARIOS.map((scenario) => (
          <button
            className="secondary-button"
            key={scenario.value}
            type="button"
            onClick={() => runScenario(scenario.value)}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      {result ? (
        <div
          className="face-scan-locked-notice"
          role="status"
          aria-live="polite"
        >
          <div className="face-scan-locked-icon">
            {result.outcome === "candidate-preview" ? (
              <UserRound size={19} />
            ) : (
              <ShieldAlert size={19} />
            )}
          </div>
          <div>
            <strong>
              {result.sampleLabel ?? "No synthetic sample returned"}
            </strong>
            <p>{result.explanation}</p>
            <p>
              Manual staff verification required. Attendance changes: none.
            </p>
          </div>
          <span className="face-gate-pill blocked">Demo only</span>
        </div>
      ) : (
        <div className="face-scan-locked-notice">
          <div className="face-scan-locked-icon">
            <ShieldAlert size={19} />
          </div>
          <div>
            <strong>No scan has been performed</strong>
            <p>
              Choose a demonstration outcome above. These buttons do not open
              the camera, read images, identify a student or change attendance.
            </p>
          </div>
          <span className="face-gate-pill blocked">Synthetic</span>
        </div>
      )}

      <p style={{ margin: "13px 0 0", color: "#82919f", fontSize: "9px", lineHeight: 1.6 }}>
        All labels are invented sample text. No face image, biometric template,
        recognition model or student record is used.
      </p>
    </section>
  );
}

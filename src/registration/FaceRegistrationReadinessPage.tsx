import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { SyntheticFaceScanDemo } from "../biometrics/SyntheticFaceScanDemo";
import { FaceCameraCapture } from "../biometrics/FaceCameraCapture";
import type { ManagedStudentRecord } from "./EditStudentDialog";

type BiometricGate = {
  capture_enabled: boolean;
  institutional_approval_reference: string | null;
  dpia_reference: string | null;
  lawful_basis_reference: string | null;
  consent_process_reference: string | null;
  retention_policy_reference: string | null;
  security_review_reference: string | null;
  alternative_process_reference: string | null;
  approved_at: string | null;
  approved_by: string | null;
};

type Props = {
  student: ManagedStudentRecord;
  onBack: () => void;
};

const REQUIREMENTS = [
  { label: "Written institutional approval for the proposed face-recognition use", field: "institutional_approval_reference" },
  { label: "Completed and reviewed Data Protection Impact Assessment (DPIA)", field: "dpia_reference" },
  { label: "Documented lawful basis and specific purpose for processing", field: "lawful_basis_reference" },
  { label: "Clear student information and a voluntary, recorded consent process", field: "consent_process_reference" },
  { label: "Retention, access, deletion and withdrawal procedures", field: "retention_policy_reference" },
  { label: "Security review covering storage, access and breach response", field: "security_review_reference" },
  { label: "A practical non-biometric attendance alternative", field: "alternative_process_reference" },
] as const;

export function FaceRegistrationReadinessPage({ student, onBack }: Props) {
  const [gate, setGate] = useState<BiometricGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [studentIsMinor, setStudentIsMinor] = useState(true);
  const [consentReference, setConsentReference] = useState("");
  const [consentVersion, setConsentVersion] = useState("");
  const [serverReady, setServerReady] = useState(false);
  const [serverStatusLoaded, setServerStatusLoaded] = useState(false);
  const [enrolmentMessage, setEnrolmentMessage] = useState("");
  const [enrolmentError, setEnrolmentError] = useState("");

  useEffect(() => {
    let active = true;
    const loadGate = async () => {
      const [gateResult, serviceResult] = await Promise.all([
        supabase
          .from("biometric_processing_gate")
          .select("capture_enabled, institutional_approval_reference, dpia_reference, lawful_basis_reference, consent_process_reference, retention_policy_reference, security_review_reference, alternative_process_reference, approved_at, approved_by")
          .eq("id", 1)
          .maybeSingle(),
        supabase.functions.invoke("face-biometric", { body: { action: "status" } }),
      ]);

      if (!active) return;
      if (gateResult.error || !gateResult.data) {
        setLoadError("The biometric readiness setting could not be verified. Face registration remains locked.");
        setGate(null);
      } else {
        setGate(gateResult.data as BiometricGate);
      }
      if (serviceResult.error || serviceResult.data?.error) {
        setLoadError("The secure face service could not verify its server settings. Camera access remains locked.");
        setServerReady(false);
      } else {
        setServerReady(Boolean(serviceResult.data?.ready));
      }
      setServerStatusLoaded(!serviceResult.error && Boolean(serviceResult.data));
      setLoading(false);
    };

    void loadGate();
    return () => {
      active = false;
    };
  }, []);

  const requirementsComplete = Boolean(
    gate?.institutional_approval_reference?.trim() &&
    gate?.dpia_reference?.trim() &&
    gate?.lawful_basis_reference?.trim() &&
    gate?.consent_process_reference?.trim() &&
    gate?.retention_policy_reference?.trim() &&
    gate?.security_review_reference?.trim() &&
    gate?.alternative_process_reference?.trim() &&
    gate?.approved_at &&
    gate?.approved_by
  );
  const ready = Boolean(gate?.capture_enabled && requirementsComplete && serverStatusLoaded && serverReady);

  const enrolStudent = async (embedding: number[]) => {
    setEnrolmentError("");
    setEnrolmentMessage("");
    if (!student.is_active) throw new Error("Archived student records cannot be enrolled.");
    if (consentReference.trim().length < 3 || !consentVersion.trim()) {
      throw new Error("Enter the consent record reference and consent document version before using the camera.");
    }

    const { data, error } = await supabase.functions.invoke("face-biometric", {
      body: {
        action: "enroll",
        student_id: student.id,
        embedding,
        student_is_minor: studentIsMinor,
        consent_authority: studentIsMinor ? "parent_guardian" : "student",
        consent_reference: consentReference.trim(),
        consent_document_version: consentVersion.trim(),
      },
    });
    if (error) throw new Error(error.message || "The secure enrollment service could not be reached.");
    if (data?.error) throw new Error(data.error);
    setEnrolmentMessage(data?.message || "The encrypted face template was enrolled.");
  };

  const handleCapture = async (embedding: number[]) => {
    try {
      await enrolStudent(embedding);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The enrollment could not be completed.";
      setEnrolmentError(message);
      throw error;
    }
  };

  return (
    <>
      <div className="page-heading face-readiness-heading">
        <div>
          <div className="eyebrow">STUDENT RECORDS / FACE REGISTRATION</div>
          <h1>Face registration readiness</h1>
          <p>Review the safeguards and consent record before creating an encrypted face template.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to student directory
        </button>
      </div>

      <section className="panel face-student-summary">
        <div className="face-student-avatar"><UserRound size={23} /></div>
        <div className="face-student-copy">
          <strong>{student.full_name}</strong>
          <span>{student.registration_number}</span>
          <small>{student.faculty} · {student.department}</small>
        </div>
        <span className={student.is_active ? "student-status-pill active" : "student-status-pill archived"}>
          {student.is_active ? "Active student" : "Archived"}
        </span>
      </section>

      <section className="panel face-readiness-status">
        <div className="face-readiness-status-icon">
          {ready ? <CheckCircle2 size={24} /> : <LockKeyhole size={24} />}
        </div>
        <div className="face-readiness-status-copy">
          <span className="eyebrow">BIOMETRIC PROCESSING STATUS</span>
          <h2>{loading ? "Checking readiness..." : ready ? "Governance gate verified" : "Face registration is locked"}</h2>
          <p>
            {loading
              ? "Checking the institution's approved processing settings."
              : ready
                ? "The server has verified the documented governance gate. Obtain and record the applicable consent before opening the camera."
                : "CampusFace will not request camera access, capture a face image, create a biometric template or upload face data while any required safeguard or server secret is missing."}
          </p>
        </div>
        <span className={ready ? "face-gate-pill ready" : "face-gate-pill blocked"}>
          {loading ? "Checking" : ready ? "Approved gate" : "Blocked"}
        </span>
      </section>

      {loadError && <div className="student-form-message" role="alert"><ShieldAlert size={16} /><span>{loadError}</span></div>}

      <section className="panel face-requirements-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">REQUIRED BEFORE ENROLLMENT</div>
            <h2>Institutional safeguards</h2>
            <p>Each item must be documented and verified by the responsible institution before biometric collection.</p>
          </div>
          <FileCheck2 size={21} />
        </div>
        <div className="face-requirements-list">
          {REQUIREMENTS.map((requirement, index) => {
            const reference = gate?.[requirement.field];
            return (
              <div className="face-requirement-row" key={requirement.field}>
                <span className="face-requirement-number">{index + 1}</span>
                <span>{requirement.label}</span>
                <span className={reference ? "face-requirement-state recorded" : "face-requirement-state"}>
                  {reference ? "Reference recorded" : "Not recorded"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {ready && student.is_active && (
        <section className="panel face-consent-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">CONSENT RECORD</div>
              <h2>Confirm the recorded consent</h2>
              <p>Enter the reference to the signed consent record held by the institution. Do not upload identity documents or signatures here.</p>
            </div>
            <ShieldCheck size={21} />
          </div>
          <label className="field">
            <span>Consent reference</span>
            <input value={consentReference} onChange={(event) => setConsentReference(event.target.value)} maxLength={240} placeholder="Institutional consent record reference" />
          </label>
          <label className="field">
            <span>Consent document version</span>
            <input value={consentVersion} onChange={(event) => setConsentVersion(event.target.value)} maxLength={80} placeholder="e.g. CAMPUSFACE-CONSENT-v1" />
          </label>
          <label className="face-minor-consent-toggle">
            <input type="checkbox" checked={studentIsMinor} onChange={(event) => setStudentIsMinor(event.target.checked)} />
            <span>
              <strong>This student is under 18 years old</strong>
              <small>{studentIsMinor ? "Parent or legal guardian consent is required." : "The student's own consent record will be used."}</small>
            </span>
          </label>
          {enrolmentMessage && <div className="face-camera-success" role="status">{enrolmentMessage}</div>}
          {enrolmentError && <div className="student-form-message" role="alert">{enrolmentError}</div>}
        </section>
      )}

      {ready && student.is_active ? (
        <FaceCameraCapture
          title="Register student face"
          description="Use the lecturer's phone camera in good lighting. Only the encrypted face feature is sent to CampusFace; the camera frame is processed on this phone and not uploaded."
          actionLabel="Capture and enrol"
          onCapture={handleCapture}
        />
      ) : (
        <section className="panel face-privacy-notice">
          <div className="face-privacy-icon"><ShieldCheck size={20} /></div>
          <div>
            <strong>Camera access remains disabled</strong>
            <p>When the server gate is complete and enabled by an authorised administrator, the enrollment camera control will appear here. An archived student cannot be enrolled.</p>
          </div>
        </section>
      )}

      <SyntheticFaceScanDemo />

      <section className="panel face-privacy-notice">
        <div className="face-privacy-icon"><ShieldCheck size={20} /></div>
        <div>
          <strong>Privacy and non-biometric alternative</strong>
          <p>
            Face images are not stored by this workflow. Templates are encrypted before storage, and matching is limited to the saved roster for the active class. A match is only a candidate and requires lecturer confirmation. The institution must still maintain its approved non-biometric attendance route and deletion/withdrawal process.
          </p>
        </div>
      </section>
    </>
  );
}

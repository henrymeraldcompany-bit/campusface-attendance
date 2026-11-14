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

  useEffect(() => {
    let active = true;
    const loadGate = async () => {
      const { data, error } = await supabase
        .from("biometric_processing_gate")
        .select("capture_enabled, institutional_approval_reference, dpia_reference, lawful_basis_reference, consent_process_reference, retention_policy_reference, security_review_reference, alternative_process_reference, approved_at")
        .eq("id", 1)
        .maybeSingle();

      if (!active) return;
      if (error || !data) {
        setLoadError("The biometric readiness setting could not be verified. Face registration remains locked.");
        setGate(null);
      } else {
        setGate(data as BiometricGate);
      }
      setLoading(false);
    };

    void loadGate();
    return () => {
      active = false;
    };
  }, []);

  const requirementsComplete = Boolean(
    gate?.institutional_approval_reference &&
    gate?.dpia_reference &&
    gate?.lawful_basis_reference &&
    gate?.consent_process_reference &&
    gate?.retention_policy_reference &&
    gate?.security_review_reference &&
    gate?.alternative_process_reference &&
    gate?.approved_at
  );
  const ready = Boolean(gate?.capture_enabled && requirementsComplete);

  return (
    <>
      <div className="page-heading face-readiness-heading">
        <div>
          <div className="eyebrow">STUDENT RECORDS / FACE REGISTRATION</div>
          <h1>Face registration readiness</h1>
          <p>Review this student's enrollment prerequisites and the institution's biometric-processing status.</p>
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
          <h2>{loading ? "Checking readiness..." : ready ? "Governance gate enabled" : "Face registration is locked"}</h2>
          <p>
            {loading
              ? "Checking the institution's approved processing settings."
              : ready
                ? "The governance gate is enabled. The camera enrollment workflow has not yet been activated in this release."
                : "CampusFace will not request camera access, capture a face image, create a biometric template or upload face data while this gate is locked."}
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
            <p>Each item must be reviewed and documented by the responsible institution before any biometric collection is enabled.</p>
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

      <section className="panel face-privacy-notice">
        <div className="face-privacy-icon"><ShieldCheck size={20} /></div>
        <div>
          <strong>Why this step is locked</strong>
          <p>
            Facial data used to uniquely identify a person is sensitive personal data under Nigeria's
            Data Protection Act. The institution must establish and document the applicable safeguards
            before this app collects or processes it. A non-biometric attendance method must remain
            available.
          </p>
        </div>
      </section>
    </>
  );
}

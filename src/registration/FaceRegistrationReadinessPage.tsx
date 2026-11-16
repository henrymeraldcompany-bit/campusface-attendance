import { useEffect, useState } from "react";
import { ArrowLeft, Camera, ShieldCheck, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import { FaceCameraCapture } from "../biometrics/FaceCameraCapture";
import type { ManagedStudentRecord } from "./EditStudentDialog";

type Props = {
  student: ManagedStudentRecord;
  onBack: () => void;
};

type AgeGroup = "under-18" | "18-or-older" | "";

export function FaceRegistrationReadinessPage({ student, onBack }: Props) {
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("");
  const [consentReference, setConsentReference] = useState("");
  const [consentVersion, setConsentVersion] = useState("CAMPUSFACE-CONSENT-v1");
  const [serverReady, setServerReady] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [enrolmentMessage, setEnrolmentMessage] = useState("");
  const [enrolmentError, setEnrolmentError] = useState("");

  useEffect(() => {
    let active = true;
    const checkService = async () => {
      setStatusLoading(true);
      const { data, error } = await supabase.functions.invoke("face-biometric", {
        body: { action: "status" },
      });
      if (!active) return;

      if (error || data?.error || !data?.ready) {
        setServerReady(false);
        setStatusMessage(data?.error || "The secure face-scanning service is not ready. Contact the CampusFace administrator.");
      } else {
        setServerReady(true);
        setStatusMessage("The secure face-scanning service is ready.");
      }
      setStatusLoading(false);
    };
    void checkService();
    return () => {
      active = false;
    };
  }, []);

  const handleCapture = async (embedding: number[]) => {
    setEnrolmentError("");
    setEnrolmentMessage("");

    if (!student.is_active) {
      throw new Error("Archived student records cannot be enrolled.");
    }
    if (!ageGroup) {
      throw new Error("Select the student's age category before capturing a face.");
    }
    if (consentReference.trim().length < 3 || !consentVersion.trim()) {
      throw new Error("Enter the recorded consent reference and consent document version before capturing a face.");
    }

    const isMinor = ageGroup === "under-18";
    const { data, error } = await supabase.functions.invoke("face-biometric", {
      body: {
        action: "enroll",
        student_id: student.id,
        embedding,
        student_is_minor: isMinor,
        consent_authority: isMinor ? "parent_guardian" : "student",
        consent_reference: consentReference.trim(),
        consent_document_version: consentVersion.trim(),
      },
    });

    if (error || data?.error) {
      const message = data?.error || error?.message || "The face could not be registered. Try again.";
      setEnrolmentError(message);
      throw new Error(message);
    }

    setEnrolmentMessage(data?.message || "Face registered successfully. The encrypted face feature is stored securely.");
  };

  return (
    <>
      <div className="page-heading face-readiness-heading">
        <div>
          <div className="eyebrow">STUDENT DIRECTORY / FACE PROFILE</div>
          <h1>Face scan</h1>
          <p>Register a face profile for this student using the lecturer's phone camera.</p>
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

      {statusLoading ? (
        <section className="panel face-readiness-status">
          <span>Checking the secure face-scanning service...</span>
        </section>
      ) : !serverReady ? (
        <section className="panel face-privacy-notice" role="alert">
          <div className="face-privacy-icon"><ShieldCheck size={20} /></div>
          <div>
            <strong>Face scanning is temporarily unavailable</strong>
            <p>{statusMessage}</p>
          </div>
        </section>
      ) : (
        <>
          <section className="panel face-consent-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">STUDENT CONSENT RECORD</div>
                <h2>Confirm the student's consent</h2>
                <p>Enter the reference for the consent already recorded by the institution. For a student under 18, the record must be parent/guardian consent.</p>
              </div>
              <ShieldCheck size={21} />
            </div>

            <label className="field">
              <span>Student age category</span>
              <select value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as AgeGroup)}>
                <option value="">Choose age category</option>
                <option value="under-18">Under 18 — parent/guardian consent</option>
                <option value="18-or-older">18 or older — student's consent</option>
              </select>
            </label>

            <label className="field">
              <span>Consent record reference</span>
              <input
                value={consentReference}
                onChange={(event) => setConsentReference(event.target.value)}
                maxLength={240}
                placeholder="Enter the institution's consent record reference"
              />
            </label>

            <label className="field">
              <span>Consent document version</span>
              <input
                value={consentVersion}
                onChange={(event) => setConsentVersion(event.target.value)}
                maxLength={80}
                placeholder="e.g. CAMPUSFACE-CONSENT-v1"
              />
            </label>

            {enrolmentMessage && <div className="face-camera-success" role="status">{enrolmentMessage}</div>}
            {enrolmentError && <div className="student-form-message" role="alert">{enrolmentError}</div>}
          </section>

          <FaceCameraCapture
            title="Register student's face"
            description="Position one face in the camera view and use good lighting. The feature is generated on this phone; the photograph and video are not uploaded."
            actionLabel="Capture and register face"
            onCapture={handleCapture}
            disabled={!student.is_active}
          />
        </>
      )}

      <section className="panel face-privacy-notice">
        <div className="face-privacy-icon"><Camera size={20} /></div>
        <div>
          <strong>How face registration works</strong>
          <p>CampusFace stores an encrypted recognition template, not the camera video or photograph. A student's template can be withdrawn by an authorised administrator. Students must retain access to the institution's approved non-biometric attendance option.</p>
        </div>
      </section>
    </>
  );
}

import { useState } from "react";
import { CheckCircle2, ScanFace, ShieldAlert, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import { FaceCameraCapture } from "./FaceCameraCapture";

type Props = {
  sessionId: string;
  disabled?: boolean;
  onAttendanceSaved: () => void;
};

type Candidate = {
  id: string;
  full_name: string;
  registration_number: string;
};

export function FaceAttendanceScanner({ sessionId, disabled = false, onAttendanceSaved }: Props) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [ticketId, setTicketId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const findCandidate = async (embedding: number[]) => {
    setCandidate(null);
    setTicketId("");
    setMessage("");
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("face-biometric", {
      body: { action: "match", session_id: sessionId, embedding },
    });
    if (invokeError) throw new Error(invokeError.message || "The recognition service could not be reached.");
    if (data?.error) throw new Error(data.error);
    if (data?.outcome === "manual_review") {
      setMessage(data.message || "No clear candidate was found. Use manual verification.");
      return;
    }
    if (data?.outcome !== "candidate" || !data?.ticket_id || !data?.student?.id) {
      throw new Error("The recognition service returned an incomplete result.");
    }
    setTicketId(data.ticket_id);
    setCandidate(data.student as Candidate);
    setMessage(data.message || "Candidate found. Confirm identity in person.");
  };

  const confirm = async () => {
    if (!ticketId || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("face-biometric", {
        body: { action: "confirm", ticket_id: ticketId },
      });
      if (invokeError) throw new Error(invokeError.message || "Attendance could not be confirmed.");
      if (data?.error) throw new Error(data.error);
      setCandidate(null);
      setTicketId("");
      setMessage(data?.result === "already_recorded"
        ? "This student was already marked present. No duplicate was created."
        : "Attendance confirmed and saved.");
      onAttendanceSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Attendance could not be confirmed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel face-attendance-scanner">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">ATTENDANCE / FACE CANDIDATE REVIEW</div>
          <h2>Scan a student</h2>
          <p>Scan one person at a time. A possible match is only a suggestion; the lecturer must verify the student in person before saving attendance.</p>
        </div>
        <ScanFace size={22} />
      </div>

      {disabled ? (
        <div className="face-scan-locked-notice">
          <ShieldAlert size={19} />
          <div>
            <strong>Face scanning is locked</strong>
            <p>The biometric processing gate is disabled or its required safeguards could not be verified. Continue with manual attendance.</p>
          </div>
          <span className="face-gate-pill blocked">Locked</span>
        </div>
      ) : (
        <FaceCameraCapture
          title="Lecturer phone camera"
          description="Use the rear camera, good lighting and one face in frame. The face feature is generated on this phone."
          actionLabel="Find student candidate"
          onCapture={findCandidate}
        />
      )}

      {candidate && (
        <div className="face-match-candidate" role="alert">
          <div className="face-match-candidate-icon"><UserRound size={20} /></div>
          <div className="face-match-candidate-details">
            <span className="eyebrow">POSSIBLE MATCH — CHECK IN PERSON</span>
            <strong>{candidate.full_name}</strong>
            <span>{candidate.registration_number}</span>
            <p>Ask the student to confirm their identity. Do not confirm based on the screen alone.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => void confirm()} disabled={busy}>
            <CheckCircle2 size={16} />
            {busy ? "Saving..." : "Confirm attendance"}
          </button>
          <button className="secondary-button" type="button" onClick={() => { setCandidate(null); setTicketId(""); setMessage("Candidate rejected. Use the manual attendance process."); }}>
            Not this student
          </button>
        </div>
      )}

      {message && !candidate && <div className="face-camera-success" role="status">{message}</div>}
      {error && <div className="student-form-message" role="alert">{error}</div>}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";

export type SessionRosterSummary = {
  id: string;
  class_title: string;
  class_date: string;
  start_time: string;
  status: "active" | "ended";
  courses: { name: string } | null;
  snapshot_count: number;
};

type SnapshotStudent = {
  student_id: string;
  student_full_name: string;
  registration_number: string;
  gender: "female" | "male";
  faculty: string;
  department: string;
  snapshotted_at: string;
};

type Props = {
  session: SessionRosterSummary;
  onBack: () => void;
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function SessionRosterPage({ session, onBack }: Props) {
  const [students, setStudents] = useState<SnapshotStudent[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);

  const loadRoster = async () => {
    setLoading(true);
    setLoadError("");

    const [rosterResult, gateResult] = await Promise.all([
      supabase
        .from("session_enrolment_snapshots")
        .select("student_id, student_full_name, registration_number, gender, faculty, department, snapshotted_at")
        .eq("session_id", session.id)
        .order("student_full_name", { ascending: true }),
      supabase
        .from("biometric_processing_gate")
        .select("capture_enabled")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (rosterResult.error) {
      setStudents([]);
      setLoadError("The saved session roster could not be loaded. Check your staff access and connection.");
    } else {
      setStudents((rosterResult.data ?? []) as SnapshotStudent[]);
    }

    // A missing or unreadable gate must always fail closed.
    setCaptureEnabled(Boolean(!gateResult.error && gateResult.data?.capture_enabled));
    setGateChecked(!gateResult.error && Boolean(gateResult.data));
    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setLoadError("");

      const [rosterResult, gateResult] = await Promise.all([
        supabase
          .from("session_enrolment_snapshots")
          .select("student_id, student_full_name, registration_number, gender, faculty, department, snapshotted_at")
          .eq("session_id", session.id)
          .order("student_full_name", { ascending: true }),
        supabase
          .from("biometric_processing_gate")
          .select("capture_enabled")
          .eq("id", 1)
          .maybeSingle(),
      ]);

      if (!active) return;

      if (rosterResult.error) {
        setStudents([]);
        setLoadError("The saved session roster could not be loaded. Check your staff access and connection.");
      } else {
        setStudents((rosterResult.data ?? []) as SnapshotStudent[]);
      }

      setCaptureEnabled(Boolean(!gateResult.error && gateResult.data?.capture_enabled));
      setGateChecked(!gateResult.error && Boolean(gateResult.data));
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [session.id]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStudents = useMemo(() => {
    if (!normalizedSearch) return students;
    return students.filter((student) =>
      [
        student.student_full_name,
        student.registration_number,
        student.faculty,
        student.department,
      ].some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
  }, [students, normalizedSearch]);

  return (
    <>
      <div className="page-heading session-roster-heading">
        <div>
          <div className="eyebrow">ATTENDANCE / STUDENT IDENTIFICATION</div>
          <h1>Eligible student roster</h1>
          <p>This is the fixed student list saved when this class session started.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to attendance
        </button>
      </div>

      <section className="panel session-roster-summary">
        <div className="session-roster-title">
          <span className="eyebrow">CLASS SESSION</span>
          <h2>{session.class_title}</h2>
          <p>{session.courses?.name ?? "Course unavailable"} · {formatDate(session.class_date)} · {session.start_time.slice(0, 5)}</p>
        </div>
        <div className="session-roster-count">
          <Users size={19} />
          <strong>{session.snapshot_count}</strong>
          <span>Eligible students</span>
        </div>
        <span className={session.status === "active" ? "student-status-pill active" : "student-status-pill archived"}>
          {session.status === "active" ? "Active session" : "Ended session"}
        </span>
      </section>

      <section className="panel session-identification-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">IDENTIFICATION WORKSPACE</div>
            <h2>Find an eligible student</h2>
            <p>Search the session snapshot by student name, registration number, faculty or department.</p>
          </div>
          <Search size={20} />
        </div>

        <label className="search-wrap session-roster-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or registration number"
            aria-label="Search eligible students"
          />
        </label>

        <div className="session-snapshot-note">
          <CheckCircle2 size={17} />
          <span>Snapshot preserved. Student edits or course-enrolment changes made after this session started will not change this list.</span>
        </div>

        {!gateChecked || !captureEnabled ? (
          <div className="face-scan-locked-notice">
            <div className="face-scan-locked-icon"><Camera size={19} /></div>
            <div>
              <strong>Face scanning is not enabled</strong>
              <p>
                {gateChecked
                  ? "The biometric-processing approval gate is still locked. This page will not open the camera or collect face images."
                  : "The biometric approval status could not be verified. Camera access remains disabled as a precaution."}
              </p>
            </div>
            <span className="face-gate-pill blocked"><ShieldAlert size={12} /> Locked</span>
          </div>
        ) : (
          <div className="face-scan-locked-notice">
            <div className="face-scan-locked-icon"><Camera size={19} /></div>
            <div>
              <strong>Camera scanner integration is not part of this release</strong>
              <p>The approval gate is enabled, but camera capture and recognition still require a separately reviewed scanner implementation.</p>
            </div>
            <span className="face-gate-pill blocked"><Clock size={12} /> Not installed</span>
          </div>
        )}
      </section>

      <section className="panel records-panel session-roster-list-panel">
        <div className="records-toolbar">
          <div>
            <h2>Students in this session</h2>
            <p>{filteredStudents.length} of {students.length} snapshotted students</p>
          </div>
          <span className="table-caption"><Users size={15} /> Fixed snapshot</span>
        </div>

        {loading ? (
          <div className="student-directory-loading">Loading the saved student snapshot...</div>
        ) : loadError ? (
          <div className="student-form-message" role="alert">{loadError}</div>
        ) : filteredStudents.length ? (
          <div className="session-roster-list">
            {filteredStudents.map((student, index) => (
              <article className="session-roster-student" key={student.student_id}>
                <span className="session-roster-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="session-roster-student-main">
                  <strong>{student.student_full_name}</strong>
                  <span>{student.registration_number}</span>
                  <small>{student.faculty} · {student.department}</small>
                </div>
                <span className="session-roster-face-status">Face profile not registered</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="session-roster-empty">
            {normalizedSearch
              ? "No eligible student matches this search."
              : "This session has no students in its saved snapshot."}
          </div>
        )}
      </section>
    </>
  );
}

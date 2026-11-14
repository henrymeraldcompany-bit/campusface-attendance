import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
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

type AttendanceMark = {
  student_id: string;
  marked_at: string;
  verification_method: "manual";
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

export function SessionRosterPage({ session, onBack }: Props) {
  const [students, setStudents] = useState<SnapshotStudent[]>([]);
  const [attendanceByStudent, setAttendanceByStudent] = useState<Record<string, AttendanceMark>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  const [pendingStudent, setPendingStudent] = useState<SnapshotStudent | null>(null);
  const [marking, setMarking] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setLoadError("");

      const [rosterResult, gateResult, attendanceResult] = await Promise.all([
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
        supabase
          .from("attendance_records")
          .select("student_id, marked_at, verification_method")
          .eq("session_id", session.id),
      ]);

      if (!active) return;

      if (rosterResult.error) {
        setStudents([]);
        setLoadError("The saved session roster could not be loaded. Check your staff access and connection.");
      } else {
        setStudents((rosterResult.data ?? []) as SnapshotStudent[]);
      }

      if (attendanceResult.error) {
        setAttendanceByStudent({});
        setLoadError("The roster loaded, but attendance marks could not be verified. Retry before marking anyone.");
      } else {
        const mapped: Record<string, AttendanceMark> = {};
        (attendanceResult.data ?? []).forEach((record) => {
          mapped[record.student_id] = record as AttendanceMark;
        });
        setAttendanceByStudent(mapped);
      }

      // A missing or unreadable biometric gate must always fail closed.
      setCaptureEnabled(Boolean(!gateResult.error && gateResult.data?.capture_enabled));
      setGateChecked(!gateResult.error && Boolean(gateResult.data));
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [session.id, reloadKey]);

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

  const presentCount = Object.keys(attendanceByStudent).length;
  const absentCount = Math.max(students.length - presentCount, 0);

  const confirmMarkPresent = async () => {
    if (!pendingStudent || marking) return;
    if (session.status !== "active") {
      setActionError("This session has ended. No further attendance marks can be added.");
      setPendingStudent(null);
      return;
    }

    setMarking(true);
    setActionMessage("");
    setActionError("");

    try {
      const { data, error } = await supabase.rpc("mark_student_present", {
        p_session_id: session.id,
        p_student_id: pendingStudent.student_id,
      });

      if (error) {
        if (error.code === "42501") {
          setActionError("Your staff account is not authorised to mark this session.");
        } else if (error.code === "22023") {
          setActionError(error.message || "This student cannot be marked present in this session.");
        } else if (error.code === "23505") {
          setActionError("This student has already been marked present.");
        } else {
          setActionError("Attendance could not be saved. Check your connection and retry.");
        }
        return;
      }

      if (data === "already_recorded") {
        setActionMessage(`${pendingStudent.student_full_name} was already marked present. No duplicate was created.`);
      } else {
        setActionMessage(`${pendingStudent.student_full_name} marked present after manual identity verification.`);
      }

      setPendingStudent(null);
      setReloadKey((value) => value + 1);
    } catch {
      setActionError("Attendance could not be saved. Check your connection and retry.");
    } finally {
      setMarking(false);
    }
  };

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
          <strong>{students.length || session.snapshot_count}</strong>
          <span>Eligible students</span>
        </div>
        <span className={session.status === "active" ? "student-status-pill active" : "student-status-pill archived"}>
          {session.status === "active" ? "Active session" : "Ended session"}
        </span>
      </section>

      <section className="stats-grid session-attendance-stats" aria-label="Session attendance totals">
        <StatCard icon={<Users size={18} />} label="Eligible" value={String(students.length)} note="Fixed session snapshot" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Present" value={String(presentCount)} note="Manually verified" />
        <StatCard icon={<Clock size={18} />} label="Not yet marked" value={String(absentCount)} note="Pending review, not final absence" />
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
          <span>Snapshot preserved. Student edits or course-enrolment changes made after this session started will not change this class's eligibility list.</span>
        </div>

        {!gateChecked || !captureEnabled ? (
          <div className="face-scan-locked-notice">
            <div className="face-scan-locked-icon"><Camera size={19} /></div>
            <div>
              <strong>Face scanning is not enabled</strong>
              <p>
                {gateChecked
                  ? "The biometric-processing approval gate is still locked. This page will not open the camera or collect face images. Use manual identity verification instead."
                  : "The biometric approval status could not be verified. Camera access remains disabled as a precaution."}
              </p>
            </div>
            <span className="face-gate-pill blocked"><ShieldAlert size={12} /> Locked</span>
          </div>
        ) : (
          <div className="face-scan-locked-notice">
            <div className="face-scan-locked-icon"><Camera size={19} /></div>
            <div>
              <strong>Camera scanner integration is not installed</strong>
              <p>The biometric gate is enabled, but camera capture and recognition still require a separately reviewed scanner implementation.</p>
            </div>
            <span className="face-gate-pill blocked"><Clock size={12} /> Not installed</span>
          </div>
        )}
      </section>

      {(actionMessage || actionError) && (
        <div className="student-form-message" role={actionError ? "alert" : "status"}>
          {actionError ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />}
          <span>{actionError || actionMessage}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => { setActionMessage(""); setActionError(""); }}>
            <X size={15} />
          </button>
        </div>
      )}

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
            {filteredStudents.map((student, index) => {
              const mark = attendanceByStudent[student.student_id];
              return (
                <article className={mark ? "session-roster-student is-present" : "session-roster-student"} key={student.student_id}>
                  <span className="session-roster-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="session-roster-student-main">
                    <strong>{student.student_full_name}</strong>
                    <span>{student.registration_number}</span>
                    <small>{student.faculty} · {student.department}</small>
                  </div>
                  {mark ? (
                    <span className="session-attendance-mark-present">
                      <CheckCircle2 size={14} />
                      Present
                      <small>{formatTime(mark.marked_at)}</small>
                    </span>
                  ) : (
                    <button
                      className="session-mark-present-button"
                      type="button"
                      onClick={() => { setPendingStudent(student); setActionError(""); setActionMessage(""); }}
                      disabled={session.status !== "active" || loading || Boolean(loadError)}
                    >
                      Mark present
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="session-roster-empty">
            {normalizedSearch
              ? "No eligible student matches this search."
              : "This session has no students in its saved snapshot."}
          </div>
        )}
      </section>

      {pendingStudent && (
        <div className="confirmation-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !marking) setPendingStudent(null);
        }}>
          <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="mark-present-title" aria-describedby="mark-present-description">
            <div className="confirmation-icon"><ShieldCheck size={22} /></div>
            <h2 id="mark-present-title">Confirm student identity</h2>
            <p id="mark-present-description">
              Confirm that you have checked <strong>{pendingStudent.student_full_name}</strong> and their registration number <strong>{pendingStudent.registration_number}</strong> against an approved university identity document and verified that they are physically present.
            </p>
            <div className="confirmation-actions">
              <button className="course-admin-text-button" type="button" onClick={() => setPendingStudent(null)} disabled={marking}>Cancel</button>
              <button className="primary-button" type="button" onClick={() => void confirmMarkPresent()} disabled={marking}>
                <CheckCircle2 size={15} />
                {marking ? "Saving..." : "Confirm present"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Lock,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { FaceAttendanceScanner } from "../biometrics/FaceAttendanceScanner";
import {
  calculateAttendanceSummary,
  csvCell,
  reportFileSlug,
} from "../lib/attendance-report";

export type SessionRosterSummary = {
  id: string;
  class_title: string;
  class_date: string;
  start_time: string;
  status: "active" | "ended";
  ended_at: string | null;
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
  verification_method: "manual" | "face_confirmed";
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
  const [sessionStatus, setSessionStatus] = useState<"active" | "ended">(session.status);
  const [endedAt, setEndedAt] = useState<string | null>(session.ended_at);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [rosterFilter, setRosterFilter] = useState<"all" | "present" | "absent">("all");

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
          .select("capture_enabled, institutional_approval_reference, dpia_reference, lawful_basis_reference, consent_process_reference, retention_policy_reference, security_review_reference, alternative_process_reference, approved_at, approved_by")
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
      const gate = gateResult.data;
      const gateComplete = Boolean(
        gate?.capture_enabled &&
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
      setCaptureEnabled(Boolean(!gateResult.error && gateComplete));
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
    return students.filter((student) => {
      const matchesSearch = !normalizedSearch || [
        student.student_full_name,
        student.registration_number,
        student.faculty,
        student.department,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
      const isPresent = Boolean(attendanceByStudent[student.student_id]);
      const matchesStatus = rosterFilter === "all" ||
        (rosterFilter === "present" && isPresent) ||
        (rosterFilter === "absent" && !isPresent);
      return matchesSearch && matchesStatus;
    });
  }, [students, normalizedSearch, rosterFilter, attendanceByStudent]);

  const {
    presentStudents,
    absentStudents,
    presentCount,
    absentCount,
    attendanceRate,
  } = useMemo(
    () => calculateAttendanceSummary(students, attendanceByStudent),
    [students, attendanceByStudent],
  );
  const sessionEnded = sessionStatus === "ended";

  const confirmMarkPresent = async () => {
    if (!pendingStudent || marking) return;
    if (sessionStatus !== "active") {
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
        setPendingStudent(null);
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
      setPendingStudent(null);
    } finally {
      setMarking(false);
    }
  };

  const confirmEndClass = async () => {
    if (ending || sessionStatus !== "active") return;

    setEnding(true);
    setActionError("");
    setActionMessage("");

    try {
      const { data, error } = await supabase.rpc("end_attendance_session", {
        p_session_id: session.id,
      });

      if (error) {
        if (error.code === "42501") {
          setActionError("Your staff account is not authorised to end this class.");
        } else if (error.code === "P0002") {
          setActionError("This class session is unavailable or you do not have access to it.");
        } else {
          setActionError("The class could not be ended. Check your connection and try again.");
        }
        setConfirmEndOpen(false);
        return;
      }

      setSessionStatus("ended");
      setEndedAt(typeof data === "string" ? data : null);
      setConfirmEndOpen(false);
      setActionMessage("Class ended. Attendance is now frozen and the final report is available.");
      setReloadKey((value) => value + 1);
    } catch {
      setActionError("The class could not be ended. Check your connection and try again.");
      setConfirmEndOpen(false);
    } finally {
      setEnding(false);
    }
  };

  const downloadCsvReport = () => {
    if (!sessionEnded || loading || loadError) return;

    const courseName = session.courses?.name ?? "Course unavailable";
    const headers = [
      "Class title",
      "Course",
      "Class date",
      "Start time",
      "Ended at",
      "Eligible students",
      "Present count",
      "Absent count",
      "Attendance rate (%)",
      "Student name",
      "Registration number",
      "Gender",
      "Faculty",
      "Department",
      "Attendance status",
      "Marked at",
      "Verification method",
    ];

    const rows = students.map((student) => {
      const mark = attendanceByStudent[student.student_id];
      return [
        session.class_title,
        courseName,
        session.class_date,
        session.start_time.slice(0, 5),
        endedAt ?? "",
        students.length,
        presentCount,
        absentCount,
        attendanceRate.toFixed(1),
        student.student_full_name,
        student.registration_number,
        student.gender,
        student.faculty,
        student.department,
        mark ? "Present" : "Absent",
        mark?.marked_at ?? "",
        mark?.verification_method ?? "",
      ];
    });

    const csv = "\uFEFF" + [headers, ...rows]
      .map((row) => row.map((value) => csvCell(value)).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CampusFace-${reportFileSlug(session.class_title)}-${session.class_date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printPdfReport = () => {
    if (!sessionEnded || loading || loadError) return;
    window.print();
  };

  return (
    <>
      <div className="page-heading session-roster-heading">
        <div>
          <div className="eyebrow">ATTENDANCE / STUDENT IDENTIFICATION</div>
          <h1>{sessionEnded ? "Final attendance report" : "Eligible student roster"}</h1>
          <p>{sessionEnded ? "This class is closed. The report below uses its saved enrolment snapshot." : "This is the fixed student list saved when this class session started."}</p>
        </div>
        <div className="session-roster-heading-actions">
          {!sessionEnded && (
            <button className="primary-button session-end-button" type="button" onClick={() => setConfirmEndOpen(true)} disabled={loading || Boolean(loadError)}>
              <Lock size={15} />
              End Class
            </button>
          )}
          <button className="secondary-button" type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to attendance
          </button>
        </div>
      </div>

      <section className="panel session-roster-summary">
        <div className="session-roster-title">
          <span className="eyebrow">CLASS SESSION</span>
          <h2>{session.class_title}</h2>
          <p>{session.courses?.name ?? "Course unavailable"} · {formatDate(session.class_date)} · {session.start_time.slice(0, 5)}{sessionEnded && endedAt ? ` · Ended ${formatTime(endedAt)}` : ""}</p>
        </div>
        <div className="session-roster-count">
          <Users size={19} />
          <strong>{students.length || session.snapshot_count}</strong>
          <span>Eligible students</span>
        </div>
        <span className={sessionEnded ? "student-status-pill archived" : "student-status-pill active"}>
          {sessionEnded ? "Ended session" : "Active session"}
        </span>
      </section>

      <section className="stats-grid session-attendance-stats" aria-label="Session attendance totals">
        <article className="stat-card">
          <div className="stat-icon"><Users size={18} /></div>
          <div className="stat-copy"><span>Eligible</span><strong>{students.length}</strong><small>Fixed session snapshot</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon"><CheckCircle2 size={18} /></div>
          <div className="stat-copy"><span>Present</span><strong>{presentCount}</strong><small>Verified attendance</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon"><Clock size={18} /></div>
          <div className="stat-copy"><span>{sessionEnded ? "Absent" : "Not yet marked"}</span><strong>{absentCount}</strong><small>{sessionEnded ? "Not marked before class ended" : "Pending review, not final absence"}</small></div>
        </article>
      </section>

      {sessionEnded && !loading && !loadError && (
        <section className="panel session-final-report">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">FINAL REPORT</div>
              <h2>Class attendance summary</h2>
              <p>The attendance figures are final because this session can no longer accept new marks.</p>
            </div>
            <ClipboardCheck size={21} />
          </div>
          <div className="session-export-actions">
            <button className="secondary-button" type="button" onClick={downloadCsvReport} disabled={loading || Boolean(loadError)}>
              <Download size={15} />
              Download CSV
            </button>
            <button className="primary-button" type="button" onClick={printPdfReport} disabled={loading || Boolean(loadError)}>
              <Printer size={15} />
              Print / Save PDF
            </button>
          </div>
          <div className="session-final-report-layout">
            <div className="session-final-rate">
              <strong>{attendanceRate.toFixed(1)}%</strong>
              <span>Attendance rate</span>
            </div>
            <div className="session-final-report-details">
              <p><strong>{presentCount}</strong> Present <span>·</span> <strong>{absentCount}</strong> Absent <span>·</span> <strong>{students.length}</strong> Eligible</p>
              <small>Calculated as present students divided by the saved eligible-student snapshot</small>
              {endedAt && <small>Finalised {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(endedAt))}</small>}
            </div>
          </div>
        </section>
      )}

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
      </section>

      <FaceAttendanceScanner
        sessionId={session.id}
        disabled={!gateChecked || !captureEnabled || sessionEnded || loading || Boolean(loadError)}
        onAttendanceSaved={() => setReloadKey((value) => value + 1)}
      />


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
            <h2>{sessionEnded ? "Final attendance lists" : "Students in this session"}</h2>
            <p>{filteredStudents.length} of {students.length} snapshotted students</p>
          </div>
          <div className="session-roster-filters" role="group" aria-label="Filter attendance list">
            <button type="button" className={rosterFilter === "all" ? "active" : ""} onClick={() => setRosterFilter("all")}>All</button>
            <button type="button" className={rosterFilter === "present" ? "active" : ""} onClick={() => setRosterFilter("present")}>Present</button>
            <button type="button" className={rosterFilter === "absent" ? "active" : ""} onClick={() => setRosterFilter("absent")}>{sessionEnded ? "Absent" : "Not yet marked"}</button>
          </div>
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
                  ) : sessionEnded ? (
                    <span className="session-attendance-mark-absent">
                      <X size={14} />
                      Absent
                      <small>Not marked before class ended</small>
                    </span>
                  ) : (
                    <button
                      className="session-mark-present-button"
                      type="button"
                      onClick={() => { setPendingStudent(student); setActionError(""); setActionMessage(""); }}
                      disabled={sessionStatus !== "active" || loading || Boolean(loadError)}
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
              ? "No eligible student matches this search and filter."
              : rosterFilter === "present"
                ? "No students have been marked present in this session."
                : rosterFilter === "absent"
                  ? sessionEnded ? "There are no absent students in this session." : "No students are currently awaiting an attendance mark."
                  : "This session has no students in its saved snapshot."}
          </div>
        )}
      </section>

      {sessionEnded && !loading && !loadError && (
        <section className="session-print-report" aria-label="Printable final attendance report">
          <header className="session-print-header">
            <div className="session-print-brand">CAMPUSFACE ATTENDANCE</div>
            <h1>Final Attendance Report</h1>
            <p>{session.class_title}</p>
            <div className="session-print-metadata">
              <span><strong>Course:</strong> {session.courses?.name ?? "Course unavailable"}</span>
              <span><strong>Date:</strong> {formatDate(session.class_date)}</span>
              <span><strong>Start time:</strong> {session.start_time.slice(0, 5)}</span>
              <span><strong>Ended:</strong> {endedAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(endedAt)) : "Not available"}</span>
            </div>
          </header>

          <section className="session-print-summary">
            <div><strong>{students.length}</strong><span>Eligible</span></div>
            <div><strong>{presentCount}</strong><span>Present</span></div>
            <div><strong>{absentCount}</strong><span>Absent</span></div>
            <div><strong>{attendanceRate.toFixed(1)}%</strong><span>Attendance rate</span></div>
          </section>

          <section className="session-print-section">
            <h2>Present students ({presentStudents.length})</h2>
            {presentStudents.length ? (
              <table>
                <thead><tr><th>No.</th><th>Student name</th><th>Registration no.</th><th>Faculty</th><th>Department</th><th>Marked at</th></tr></thead>
                <tbody>
                  {presentStudents.map((student, index) => (
                    <tr key={student.student_id}>
                      <td>{index + 1}</td>
                      <td>{student.student_full_name}</td>
                      <td>{student.registration_number}</td>
                      <td>{student.faculty}</td>
                      <td>{student.department}</td>
                      <td>{attendanceByStudent[student.student_id] ? formatTime(attendanceByStudent[student.student_id].marked_at) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="session-print-empty">No students were marked present.</p>}
          </section>

          <section className="session-print-section">
            <h2>Absent students ({absentStudents.length})</h2>
            {absentStudents.length ? (
              <table>
                <thead><tr><th>No.</th><th>Student name</th><th>Registration no.</th><th>Faculty</th><th>Department</th></tr></thead>
                <tbody>
                  {absentStudents.map((student, index) => (
                    <tr key={student.student_id}>
                      <td>{index + 1}</td>
                      <td>{student.student_full_name}</td>
                      <td>{student.registration_number}</td>
                      <td>{student.faculty}</td>
                      <td>{student.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="session-print-empty">No students were absent.</p>}
          </section>

          <footer className="session-print-footer">
            Generated by CampusFace Attendance. Present marks were recorded through manual staff verification.
          </footer>
        </section>
      )}

      {confirmEndOpen && (
        <div className="confirmation-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !ending) setConfirmEndOpen(false);
        }}>
          <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="end-class-title" aria-describedby="end-class-description">
            <div className="confirmation-icon"><Lock size={22} /></div>
            <h2 id="end-class-title">End this class?</h2>
            <p id="end-class-description">
              This will permanently close <strong>{session.class_title}</strong>. Students not marked present will become absent in the final report. No more attendance marks can be added, and this session cannot be reopened.
            </p>
            <div className="confirmation-actions">
              <button className="course-admin-text-button" type="button" onClick={() => setConfirmEndOpen(false)} disabled={ending}>Continue class</button>
              <button className="primary-button" type="button" onClick={() => void confirmEndClass()} disabled={ending}>
                <Lock size={15} />
                {ending ? "Ending class..." : "Confirm End Class"}
              </button>
            </div>
          </section>
        </div>
      )}

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

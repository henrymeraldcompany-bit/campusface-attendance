import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, RefreshCw, Save, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { CourseRecord } from "./CourseCataloguePage";

type Lecturer = {
  id: string;
  email: string;
  full_name: string;
  staff_role: "lecturer" | "administrator";
  is_active: boolean;
};

type StaffListResponse = {
  error?: string;
  staff?: Lecturer[];
};

type AssignmentRow = {
  course_id: string;
};

type Props = {
  onBack: () => void;
};

export function LecturerCourseAssignmentsPage({ onBack }: Props) {
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [selectedLecturerId, setSelectedLecturerId] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [savedCourseIds, setSavedCourseIds] = useState<string[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activeCourses = useMemo(
    () => courses.filter((course) => course.is_active),
    [courses],
  );
  const selectedLecturer = lecturers.find((lecturer) => lecturer.id === selectedLecturerId);
  const hasChanges =
    selectedCourseIds.length !== savedCourseIds.length ||
    selectedCourseIds.some((id) => !savedCourseIds.includes(id));

  useEffect(() => {
    let mounted = true;

    const loadDirectory = async () => {
      setLoadingDirectory(true);
      setErrorMessage("");

      try {
        const [staffResult, courseResult] = await Promise.all([
          supabase.functions.invoke<StaffListResponse>("manage-staff", {
            body: { action: "list" },
          }),
          supabase
            .from("courses")
            .select("id, name, is_active")
            .order("name", { ascending: true }),
        ]);

        if (staffResult.error) {
          throw new Error(staffResult.error.message || "Staff accounts could not be loaded.");
        }
        if (staffResult.data?.error) {
          throw new Error(staffResult.data.error);
        }
        if (courseResult.error) {
          throw new Error(courseResult.error.message || "The course catalogue could not be loaded.");
        }

        if (!mounted) return;

        const activeLecturers = (staffResult.data?.staff ?? []).filter(
          (member) => member.staff_role === "lecturer" && member.is_active,
        );

        setLecturers(activeLecturers);
        setCourses((courseResult.data ?? []) as CourseRecord[]);
        setSelectedLecturerId((current) =>
          activeLecturers.some((lecturer) => lecturer.id === current)
            ? current
            : activeLecturers[0]?.id ?? "",
        );
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Lecturer accounts and courses could not be loaded.",
        );
      } finally {
        if (mounted) setLoadingDirectory(false);
      }
    };

    void loadDirectory();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!selectedLecturerId) {
      setSelectedCourseIds([]);
      setSavedCourseIds([]);
      setLoadingAssignments(false);
      return () => {
        mounted = false;
      };
    }

    const loadAssignments = async () => {
      setLoadingAssignments(true);
      setErrorMessage("");
      setMessage("");

      const { data, error } = await supabase
        .from("lecturer_course_assignments")
        .select("course_id")
        .eq("lecturer_id", selectedLecturerId);

      if (!mounted) return;

      if (error) {
        setErrorMessage(
          "The lecturer's assigned courses could not be loaded. Refresh the page and try again.",
        );
        setSelectedCourseIds([]);
        setSavedCourseIds([]);
      } else {
        const activeCourseIds = new Set(activeCourses.map((course) => course.id));
        const ids = ((data ?? []) as AssignmentRow[])
          .map((row) => row.course_id)
          .filter((id) => activeCourseIds.has(id));
        setSelectedCourseIds(ids);
        setSavedCourseIds(ids);
      }

      setLoadingAssignments(false);
    };

    void loadAssignments();

    return () => {
      mounted = false;
    };
  }, [selectedLecturerId, activeCourses]);

  const toggleCourse = (courseId: string, checked: boolean) => {
    setSelectedCourseIds((current) =>
      checked
        ? [...current, courseId]
        : current.filter((id) => id !== courseId),
    );
    setMessage("");
  };

  const handleCourseChange = (event: ChangeEvent<HTMLInputElement>, courseId: string) => {
    toggleCourse(courseId, event.target.checked);
  };

  const saveAssignments = async () => {
    if (!selectedLecturerId || saving || !hasChanges) return;

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { error } = await supabase.rpc("set_lecturer_course_assignments", {
        p_lecturer_id: selectedLecturerId,
        p_course_ids: selectedCourseIds,
      });

      if (error) {
        throw new Error(
          error.code === "42501"
            ? "Only an active administrator can change lecturer course assignments."
            : error.message || "The course assignments could not be saved.",
        );
      }

      setSavedCourseIds([...selectedCourseIds]);
      setMessage(
        selectedCourseIds.length === 0
          ? "All course assignments were removed from this lecturer."
          : `${selectedCourseIds.length} course${selectedCourseIds.length === 1 ? "" : "s"} assigned successfully.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The course assignments could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-heading staff-admin-heading">
        <div>
          <div className="eyebrow">ADMINISTRATOR / COURSE ACCESS</div>
          <h1>Lecturer course assignments</h1>
          <p>Choose which active courses each lecturer is authorised to teach and take attendance for.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Settings
        </button>
      </div>

      <section className="stats-grid">
        <article className="stat-card">
          <div className="stat-icon"><Users size={19} /></div>
          <div className="stat-copy"><span>Active lecturers</span><strong>{lecturers.length}</strong><small>Eligible for course assignment</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon"><BookOpen size={19} /></div>
          <div className="stat-copy"><span>Active courses</span><strong>{activeCourses.length}</strong><small>Available in the catalogue</small></div>
        </article>
      </section>

      {message && <div className="student-form-message" role="status"><CheckCircle2 size={16} /><span>{message}</span></div>}
      {errorMessage && <div className="student-form-message staff-error-message" role="alert"><span>{errorMessage}</span></div>}

      <section className="panel lecturer-assignments-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">SELECT LECTURER</div>
            <h2>Choose a staff account</h2>
            <p>Only active lecturer accounts are listed. Invite a new lecturer from Staff and permissions first.</p>
          </div>
          <button
            className="course-admin-text-button"
            type="button"
            onClick={() => window.location.reload()}
            disabled={loadingDirectory || saving}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loadingDirectory ? (
          <div className="student-directory-loading">Loading lecturers and courses...</div>
        ) : lecturers.length === 0 ? (
          <div className="course-admin-empty">
            No active lecturer accounts are available yet. Invite a lecturer from Staff and permissions, then return here to assign courses.
          </div>
        ) : (
          <>
            <label className="field lecturer-assignment-select">
              <span>Lecturer</span>
              <select
                value={selectedLecturerId}
                onChange={(event) => setSelectedLecturerId(event.target.value)}
                disabled={loadingAssignments || saving}
              >
                {lecturers.map((lecturer) => (
                  <option value={lecturer.id} key={lecturer.id}>
                    {lecturer.full_name} — {lecturer.email}
                  </option>
                ))}
              </select>
            </label>

            {selectedLecturer && (
              <div className="lecturer-assignment-selected">
                <div className="staff-admin-avatar">{selectedLecturer.full_name.trim().charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{selectedLecturer.full_name}</strong>
                  <span>{selectedLecturer.email}</span>
                </div>
                <span className="lecturer-assignment-count">{selectedCourseIds.length} selected</span>
              </div>
            )}

            <div className="lecturer-course-heading">
              <div>
                <h3>Available courses</h3>
                <p>Select every course this lecturer is authorised to manage.</p>
              </div>
              <span>{selectedCourseIds.length} of {activeCourses.length}</span>
            </div>

            {loadingAssignments ? (
              <div className="student-directory-loading">Loading current assignments...</div>
            ) : activeCourses.length === 0 ? (
              <div className="course-admin-empty">No active courses are available. Add or reactivate courses in the Course catalogue.</div>
            ) : (
              <div className="lecturer-course-grid" role="group" aria-label="Courses assigned to this lecturer">
                {activeCourses.map((course) => (
                  <label className="lecturer-course-option" key={course.id}>
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.includes(course.id)}
                      onChange={(event) => handleCourseChange(event, course.id)}
                      disabled={saving || loadingAssignments}
                    />
                    <span className="lecturer-course-option-check"><CheckCircle2 size={16} /></span>
                    <span className="lecturer-course-option-name">{course.name}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="lecturer-assignment-footer">
              <p>Saving replaces this lecturer's current active-course assignment list. Previous attendance sessions and reports remain preserved.</p>
              <button
                className="primary-button"
                type="button"
                onClick={() => void saveAssignments()}
                disabled={saving || loadingAssignments || loadingDirectory || !hasChanges || activeCourses.length === 0}
              >
                <Save size={16} /> {saving ? "Saving assignments..." : "Save assignments"}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

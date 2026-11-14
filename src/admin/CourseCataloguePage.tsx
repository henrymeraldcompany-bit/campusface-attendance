import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, BookOpen, Check, Plus, X } from "lucide-react";
import { supabase } from "../lib/supabase";

export type CourseRecord = {
  id: string;
  name: string;
  is_active: boolean;
};

type CourseCataloguePageProps = {
  courses: CourseRecord[];
  loading: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
};

export function CourseCataloguePage({
  courses,
  loading,
  onBack,
  onRefresh,
}: CourseCataloguePageProps) {
  const [newCourseName, setNewCourseName] = useState("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
  const [savingNewCourse, setSavingNewCourse] = useState(false);
  const [message, setMessage] = useState("");

  const activeCount = courses.filter((course) => course.is_active).length;
  const inactiveCount = courses.length - activeCount;

  const getErrorMessage = (error: { code?: string } | null) => {
    if (error?.code === "23505") {
      return "A course with this name already exists. Course names are not case-sensitive.";
    }
    if (error?.code === "42501") {
      return "Your account does not have permission to manage the course catalogue.";
    }
    return "The change could not be saved. Check your connection and try again.";
  };

  const handleAddCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newCourseName.trim();
    if (name.length < 2 || name.length > 120 || savingNewCourse) return;

    setSavingNewCourse(true);
    setMessage("");
    try {
      const { error } = await supabase.from("courses").insert({ name });
      if (error) {
        setMessage(getErrorMessage(error));
        return;
      }
      setNewCourseName("");
      setMessage("Course added to the catalogue.");
      await onRefresh();
    } finally {
      setSavingNewCourse(false);
    }
  };

  const beginEditing = (course: CourseRecord) => {
    setEditingCourseId(course.id);
    setEditingName(course.name);
    setMessage("");
  };

  const cancelEditing = () => {
    setEditingCourseId(null);
    setEditingName("");
  };

  const saveCourseName = async (course: CourseRecord) => {
    const name = editingName.trim();
    if (name.length < 2 || name.length > 120 || busyCourseId) return;

    setBusyCourseId(course.id);
    setMessage("");
    try {
      const { error } = await supabase
        .from("courses")
        .update({ name })
        .eq("id", course.id);

      if (error) {
        setMessage(getErrorMessage(error));
        return;
      }

      setEditingCourseId(null);
      setEditingName("");
      setMessage("Course name updated.");
      await onRefresh();
    } finally {
      setBusyCourseId(null);
    }
  };

  const toggleCourseStatus = async (course: CourseRecord) => {
    if (busyCourseId) return;

    setBusyCourseId(course.id);
    setMessage("");
    try {
      const { error } = await supabase
        .from("courses")
        .update({ is_active: !course.is_active })
        .eq("id", course.id);

      if (error) {
        setMessage(getErrorMessage(error));
        return;
      }

      setMessage(
        course.is_active
          ? "Course deactivated. It will no longer appear in new selections."
          : "Course reactivated and available for selection again.",
      );
      await onRefresh();
    } finally {
      setBusyCourseId(null);
    }
  };

  return (
    <>
      <div className="page-heading course-admin-heading">
        <div>
          <div className="eyebrow">ACADEMIC MANAGEMENT</div>
          <h1>Course catalogue</h1>
          <p>Manage the courses available for student enrolment and class sessions.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to workspace
        </button>
      </div>

      <section className="stats-grid" aria-label="Course catalogue summary">
        <article className="stat-card">
          <div className="stat-icon"><BookOpen size={19} /></div>
          <div className="stat-copy">
            <span>Total courses</span>
            <strong>{courses.length}</strong>
            <small>In the catalogue</small>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon"><Check size={19} /></div>
          <div className="stat-copy">
            <span>Active courses</span>
            <strong>{activeCount}</strong>
            <small>Available for new selections</small>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon"><X size={19} /></div>
          <div className="stat-copy">
            <span>Inactive courses</span>
            <strong>{inactiveCount}</strong>
            <small>Kept for historical continuity</small>
          </div>
        </article>
      </section>

      <section className="panel course-admin-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">ADD A COURSE</div>
            <h2>Expand the catalogue</h2>
            <p>Course names must be unique, ignoring capital letters and extra spaces.</p>
          </div>
          <span className="step-tag">ADMINISTRATOR</span>
        </div>
        <form className="course-admin-add-form" onSubmit={handleAddCourse}>
          <label className="field">
            <span>Course name</span>
            <input
              type="text"
              value={newCourseName}
              onChange={(event) => setNewCourseName(event.target.value)}
              placeholder="Enter a course name"
              minLength={2}
              maxLength={120}
              required
              disabled={savingNewCourse}
            />
          </label>
          <button className="primary-button" type="submit" disabled={savingNewCourse || newCourseName.trim().length < 2}>
            <Plus size={17} />
            {savingNewCourse ? "Adding..." : "Add course"}
          </button>
        </form>
        {message && <p className="course-admin-message" role="status">{message}</p>}
      </section>

      <section className="panel course-admin-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">SAVED COURSES</div>
            <h2>Manage courses</h2>
            <p>Rename courses or deactivate them. Courses are not permanently deleted.</p>
          </div>
          <span className="step-tag">{activeCount} ACTIVE</span>
        </div>

        {loading ? (
          <div className="course-admin-empty">Loading the course catalogue...</div>
        ) : courses.length === 0 ? (
          <div className="course-admin-empty">No courses are available yet. Add the first course above.</div>
        ) : (
          <div className="course-admin-list">
            {courses.map((course) => (
              <article className="course-admin-row" key={course.id}>
                <div className="course-admin-row-main">
                  {editingCourseId === course.id ? (
                    <input
                      className="course-admin-edit-input"
                      type="text"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      minLength={2}
                      maxLength={120}
                      aria-label={`Rename ${course.name}`}
                      disabled={busyCourseId === course.id}
                    />
                  ) : (
                    <strong>{course.name}</strong>
                  )}
                  <span className={course.is_active ? "course-admin-status active" : "course-admin-status inactive"}>
                    {course.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="course-admin-actions">
                  {editingCourseId === course.id ? (
                    <>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void saveCourseName(course)}
                        disabled={busyCourseId === course.id || editingName.trim().length < 2}
                      >
                        {busyCourseId === course.id ? "Saving..." : "Save name"}
                      </button>
                      <button type="button" className="course-admin-text-button" onClick={cancelEditing} disabled={busyCourseId === course.id}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="course-admin-text-button" onClick={() => beginEditing(course)}>
                        Rename
                      </button>
                      <button
                        type="button"
                        className={course.is_active ? "course-admin-status-button deactivate" : "course-admin-status-button activate"}
                        onClick={() => void toggleCourseStatus(course)}
                        disabled={busyCourseId === course.id}
                      >
                        {busyCourseId === course.id
                          ? "Saving..."
                          : course.is_active
                            ? "Deactivate"
                            : "Activate"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

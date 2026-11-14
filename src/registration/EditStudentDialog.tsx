import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, Pencil, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { CourseRecord } from "../admin/CourseCataloguePage";

export type AcademicFacultyOption = { id: string; name: string; is_active: boolean };
export type AcademicDepartmentOption = { id: string; faculty_id: string; name: string; is_active: boolean };

export type ManagedStudentRecord = {
  id: string;
  full_name: string;
  registration_number: string;
  gender: "female" | "male";
  faculty: string;
  department: string;
  faculty_id: string | null;
  department_id: string | null;
  is_active: boolean;
  student_courses: Array<{
    course_id: string;
    courses: { name: string } | null;
  }>;
};

type EditStudentDialogProps = {
  student: ManagedStudentRecord;
  courses: CourseRecord[];
  faculties: AcademicFacultyOption[];
  departments: AcademicDepartmentOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function EditStudentDialog({
  student,
  courses,
  faculties,
  departments,
  onClose,
  onSaved,
}: EditStudentDialogProps) {
  const [fullName, setFullName] = useState(student.full_name);
  const [registrationNumber, setRegistrationNumber] = useState(student.registration_number);
  const [gender, setGender] = useState<"female" | "male">(student.gender);
  const matchedFaculty = faculties.find((item) => item.name.trim().toLowerCase() === student.faculty.trim().toLowerCase());
  const initialFacultyId = student.faculty_id ?? matchedFaculty?.id ?? "";
  const matchedDepartment = departments.find((item) =>
    item.faculty_id === initialFacultyId &&
    item.name.trim().toLowerCase() === student.department.trim().toLowerCase()
  );
  const [facultyId, setFacultyId] = useState(initialFacultyId);
  const [departmentId, setDepartmentId] = useState(student.department_id ?? matchedDepartment?.id ?? "");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(
    student.student_courses.map((item) => item.course_id),
  );
  const [courseSearch, setCourseSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId],
    );
  };

  const facultyChoices = faculties.filter((faculty) => faculty.is_active || faculty.id === facultyId);
  const departmentChoices = departments.filter((department) =>
    department.faculty_id === facultyId && (department.is_active || department.id === departmentId)
  );

  const filteredCourses = courses.filter((course) => {
    const matchesSearch = course.name.toLowerCase().includes(courseSearch.trim().toLowerCase());
    const isAlreadyEnrolled = selectedCourseIds.includes(course.id);
    return matchesSearch && (course.is_active || isAlreadyEnrolled);
  });

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!facultyId || !departmentId) {
      setMessage("Select a faculty and a department belonging to that faculty.");
      return;
    }

    if (selectedCourseIds.length === 0) {
      setMessage("Select at least one active course for this student.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("update_student_record_with_academic_structure", {
        p_student_id: student.id,
        p_full_name: fullName.trim(),
        p_registration_number: registrationNumber.trim(),
        p_gender: gender,
        p_faculty_id: facultyId,
        p_department_id: departmentId,
        p_course_ids: selectedCourseIds,
      });

      if (error) {
        if (error.code === "23505") {
          setMessage("That registration number is already in use by another student.");
        } else if (error.code === "42501") {
          setMessage("Your staff account is not authorised to update student records.");
        } else if (error.code === "22023" || error.code === "23514") {
          setMessage(error.message || "Check the student details and selected courses.");
        } else if (error.code === "P0002") {
          setMessage("This student record could not be found. Refresh the directory and try again.");
        } else {
          setMessage("The changes could not be saved. Check your connection and try again.");
        }
        return;
      }

      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="student-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section
        className="student-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-student-title"
      >
        <div className="student-dialog-header">
          <div>
            <div className="eyebrow">STUDENT RECORD MANAGEMENT</div>
            <h2 id="edit-student-title">Edit student record</h2>
            <p>Update academic information and course enrolments.</p>
          </div>
          <button type="button" className="student-dialog-close" aria-label="Close edit form" onClick={onClose} disabled={saving}>
            <X size={19} />
          </button>
        </div>

        {message && <div className="student-form-message" role="alert">{message}</div>}

        <form onSubmit={handleSave}>
          <div className="form-grid">
            <label className="field full-field">
              <span>Full name</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={120} required disabled={saving} />
            </label>
            <label className="field">
              <span>Registration number</span>
              <input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} minLength={2} maxLength={60} required disabled={saving} />
            </label>
            <label className="field">
              <span>Gender</span>
              <select value={gender} onChange={(event) => setGender(event.target.value as "female" | "male")} disabled={saving}>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
            <label className="field">
              <span>Faculty</span>
              <select
                value={facultyId}
                onChange={(event) => {
                  setFacultyId(event.target.value);
                  setDepartmentId("");
                }}
                required
                disabled={saving}
              >
                <option value="" disabled>Select faculty</option>
                {facultyChoices.map((faculty) => (
                  <option key={faculty.id} value={faculty.id}>
                    {faculty.name}{!faculty.is_active ? " (inactive — existing record)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Department</span>
              <select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                required
                disabled={saving || !facultyId}
              >
                <option value="" disabled>{facultyId ? "Select department" : "Select faculty first"}</option>
                {departmentChoices.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}{!department.is_active ? " (inactive — existing record)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="course-picker edit-course-picker">
            <div className="course-picker-heading">
              <div>
                <strong>Course enrolments</strong>
                <span>Selected inactive courses can be removed, but not newly assigned.</span>
              </div>
              <span className="selection-count">{selectedCourseIds.length} selected</span>
            </div>
            <label className="course-search-wrap">
              <input
                value={courseSearch}
                onChange={(event) => setCourseSearch(event.target.value)}
                placeholder="Find a course"
                aria-label="Search courses"
                disabled={saving}
              />
            </label>
            <div className="course-options">
              {filteredCourses.map((course) => {
                const selected = selectedCourseIds.includes(course.id);
                return (
                  <label key={course.id} className={selected ? "course-option checked" : "course-option"}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleCourse(course.id)}
                      disabled={saving || (!course.is_active && !selected)}
                    />
                    <span className="custom-check">{selected && <Check size={13} />}</span>
                    <span>{course.name}{!course.is_active ? " (inactive)" : ""}</span>
                  </label>
                );
              })}
              {filteredCourses.length === 0 && <p className="course-list-empty">No courses match this search.</p>}
            </div>
          </div>

          <div className="student-dialog-actions">
            <button className="course-admin-text-button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving || selectedCourseIds.length === 0 || !facultyId || !departmentId}>
              <Pencil size={16} />
              {saving ? "Saving changes..." : "Save changes"}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

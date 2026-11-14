import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BookOpen, Mail, RefreshCw, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type StaffMember = {
  id: string;
  email: string;
  full_name: string;
  staff_role: "lecturer" | "administrator";
  is_active: boolean;
  created_at: string;
};

type Props = {
  onBack: () => void;
};

type StaffActionResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  staff?: StaffMember[];
};

type CourseOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export function StaffManagementPage({ onBack }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"lecturer" | "administrator">("lecturer");
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke<StaffActionResponse>("manage-staff", { body });
    if (error) {
      const context = error.context as Response | undefined;
      if (context && typeof context.json === "function") {
        try {
          const payload = await context.json() as StaffActionResponse;
          throw new Error(payload.error || error.message);
        } catch (readError) {
          if (readError instanceof Error && readError.message !== error.message) throw readError;
        }
      }
      throw new Error(error.message || "The staff-management request failed.");
    }
    if (data?.error) throw new Error(data.error);
    return data ?? {};
  };

  const loadStaff = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [result, courseResult] = await Promise.all([
        invoke({ action: "list" }),
        supabase
          .from("courses")
          .select("id, name, is_active")
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);
      if (courseResult.error) {
        throw new Error("The active course catalogue could not be loaded. Refresh and try again.");
      }
      setStaff(result.staff ?? []);
      setCourses((courseResult.data ?? []) as CourseOption[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Staff accounts could not be loaded.");
      setStaff([]);
    } finally {
      setLoading(false);
      setCoursesLoading(false);
    }
  };

  useEffect(() => {
    void loadStaff();
  }, []);

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inviting) return;
    if (role === "lecturer" && selectedCourseIds.length === 0) {
      setErrorMessage("Select at least one course for this lecturer before sending the invitation.");
      return;
    }
    setInviting(true);
    setMessage("");
    setErrorMessage("");
    try {
      const result = await invoke({
        action: "invite",
        full_name: fullName.trim(),
        email: email.trim(),
        staff_role: role,
        course_ids: role === "lecturer" ? selectedCourseIds : [],
      });
      setFullName("");
      setEmail("");
      setRole("lecturer");
      setSelectedCourseIds([]);
      setMessage(result.message || "Staff invitation created with the selected course assignments.");
      await loadStaff();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The invitation could not be sent.");
    } finally {
      setInviting(false);
    }
  };

  const updateStaff = async (member: StaffMember, patch: Partial<Pick<StaffMember, "staff_role" | "is_active">>) => {
    setBusyId(member.id);
    setMessage("");
    setErrorMessage("");
    try {
      const result = await invoke({ action: "update", staff_id: member.id, ...patch });
      setMessage(result.message || "Staff account updated.");
      await loadStaff();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The staff account could not be updated.");
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = staff.filter((member) => member.is_active).length;
  const lecturerCount = staff.filter((member) => member.staff_role === "lecturer" && member.is_active).length;
  const adminCount = staff.filter((member) => member.staff_role === "administrator" && member.is_active).length;

  return (
    <>
      <div className="page-heading staff-admin-heading">
        <div>
          <div className="eyebrow">ADMINISTRATOR / STAFF ACCESS</div>
          <h1>Staff and permissions</h1>
          <p>Invite lecturers with their courses already assigned, and manage staff access.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}><ShieldCheck size={16}/> Back to Settings</button>
      </div>

      <section className="stats-grid">
        <article className="stat-card"><div className="stat-icon"><Users size={19}/></div><div className="stat-copy"><span>Active staff</span><strong>{activeCount}</strong><small>Can access CampusFace</small></div></article>
        <article className="stat-card"><div className="stat-icon"><UserPlus size={19}/></div><div className="stat-copy"><span>Lecturers</span><strong>{lecturerCount}</strong><small>Active lecturer accounts</small></div></article>
        <article className="stat-card"><div className="stat-icon"><ShieldCheck size={19}/></div><div className="stat-copy"><span>Administrators</span><strong>{adminCount}</strong><small>Active administrators</small></div></article>
      </section>

      {message && <div className="student-form-message" role="status"><span>{message}</span><button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={15}/></button></div>}
      {errorMessage && <div className="student-form-message staff-error-message" role="alert"><span>{errorMessage}</span><button type="button" aria-label="Dismiss" onClick={() => setErrorMessage("")}><X size={15}/></button></div>}

      <section className="panel staff-admin-panel">
        <div className="panel-heading"><div><div className="eyebrow">NEW STAFF ACCOUNT</div><h2>Invite staff member</h2><p>Enter the lecturer's name, email and courses before sending the invitation link.</p></div><Mail size={20}/></div>
        <form className="staff-invite-form" onSubmit={handleInvite}>
          <label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Enter staff full name" minLength={2} maxLength={120} required disabled={inviting}/></label>
          <label className="field"><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@university.edu" maxLength={254} required disabled={inviting}/></label>
          <label className="field"><span>Access role</span><select value={role} onChange={(event) => { const nextRole = event.target.value as "lecturer" | "administrator"; setRole(nextRole); if (nextRole !== "lecturer") setSelectedCourseIds([]); }} disabled={inviting}><option value="lecturer">Lecturer</option><option value="administrator">Administrator</option></select></label>
          {role === "lecturer" && (
            <div className="staff-invite-course-picker">
              <div className="staff-invite-course-heading">
                <div><strong>Assign lecturer courses</strong><span>Select the courses this lecturer will be allowed to manage.</span></div>
                <small>{selectedCourseIds.length} selected</small>
              </div>
              {coursesLoading ? (
                <div className="student-directory-loading">Loading active courses...</div>
              ) : courses.length === 0 ? (
                <div className="course-admin-empty">There are no active courses. Add courses to the catalogue before inviting a lecturer.</div>
              ) : (
                <div className="staff-invite-course-grid">
                  {courses.map((course) => (
                    <label className="staff-invite-course-option" key={course.id}>
                      <input
                        type="checkbox"
                        checked={selectedCourseIds.includes(course.id)}
                        onChange={(event) => setSelectedCourseIds((current) =>
                          event.target.checked
                            ? [...current, course.id]
                            : current.filter((id) => id !== course.id)
                        )}
                        disabled={inviting}
                      />
                      <span>{course.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="primary-button" type="submit" disabled={inviting || coursesLoading || fullName.trim().length < 2 || !email.includes("@") || (role === "lecturer" && (courses.length === 0 || selectedCourseIds.length === 0))}><Mail size={16}/>{inviting ? "Sending invitation..." : "Send invitation link"}</button>
        </form>
        <p className="staff-admin-note">Only administrators can invite staff. A lecturer receives the selected courses as part of the invitation process and cannot add courses to their own account. Invitees create their own password through the secure email link.</p>
      </section>

      <section className="panel staff-admin-panel">
        <div className="panel-heading"><div><div className="eyebrow">ACCESS CONTROL</div><h2>Staff directory</h2><p>Change roles or deactivate accounts. At least one active administrator must remain.</p></div><button className="course-admin-text-button" type="button" onClick={() => void loadStaff()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
        {loading ? <div className="student-directory-loading">Loading staff accounts...</div> : staff.length === 0 ? <div className="course-admin-empty">No staff profiles found.</div> : (
          <div className="staff-admin-list">
            {staff.map((member) => (
              <article className="staff-admin-row" key={member.id}>
                <div className="staff-admin-avatar">{member.full_name.trim().charAt(0).toUpperCase()}</div>
                <div className="staff-admin-main"><strong>{member.full_name}</strong><span>{member.email}</span><small>{member.is_active ? "Active access" : "Access suspended"}</small></div>
                <div className="staff-admin-controls">
                  <label className="staff-role-select"><span>Role</span><select value={member.staff_role} onChange={(event) => void updateStaff(member, { staff_role: event.target.value as "lecturer" | "administrator" })} disabled={busyId === member.id}><option value="lecturer">Lecturer</option><option value="administrator">Administrator</option></select></label>
                  <button className={member.is_active ? "course-admin-status-button deactivate" : "course-admin-status-button activate"} type="button" onClick={() => void updateStaff(member, { is_active: !member.is_active })} disabled={busyId === member.id}>{busyId === member.id ? "Saving..." : member.is_active ? "Deactivate" : "Reactivate"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

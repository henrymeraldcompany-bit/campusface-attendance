import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Department = {
  id: string;
  faculty_id: string;
  name: string;
  is_active: boolean;
};

type Faculty = {
  id: string;
  name: string;
  is_active: boolean;
  departments: Department[];
};

type Props = {
  onBack: () => void;
};

export function AcademicStructurePage({ onBack }: Props) {
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [facultyName, setFacultyName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [editingFacultyId, setEditingFacultyId] = useState<string | null>(null);
  const [editingFacultyName, setEditingFacultyName] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [editingDepartmentName, setEditingDepartmentName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingFaculty, setAddingFaculty] = useState(false);
  const [addingDepartment, setAddingDepartment] = useState(false);
  const [message, setMessage] = useState("");

  const loadFaculties = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("faculties")
      .select("id, name, is_active, departments(id, faculty_id, name, is_active)")
      .order("name", { ascending: true });

    if (error) {
      setMessage("Academic structure could not be loaded. Check your administrator access.");
      setFaculties([]);
    } else {
      const rows = (data ?? []) as unknown as Faculty[];
      setFaculties(rows.map((faculty) => ({
        ...faculty,
        departments: [...(faculty.departments ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
      })));
      if (!selectedFacultyId && rows.length > 0) {
        setSelectedFacultyId(rows.find((item) => item.is_active)?.id ?? rows[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadFaculties();
  }, []);

  const errorText = (error: { code?: string; message?: string }) => {
    if (error.code === "23505") return "That name already exists. Names are checked without regard to capital letters or surrounding spaces.";
    if (error.code === "42501") return "Only active administrators can change the academic structure.";
    if (error.code === "23503") return "This faculty is linked to existing records and cannot be removed.";
    return error.message || "The change could not be saved. Please try again.";
  };

  const addFaculty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addingFaculty) return;
    const name = facultyName.trim();
    if (name.length < 2) return;
    setAddingFaculty(true);
    setMessage("");
    try {
      const { error } = await supabase.from("faculties").insert({ name });
      if (error) {
        setMessage(errorText(error));
        return;
      }
      setFacultyName("");
      setMessage("Faculty added.");
      await loadFaculties();
    } finally {
      setAddingFaculty(false);
    }
  };

  const addDepartment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addingDepartment) return;
    const name = departmentName.trim();
    if (name.length < 2 || !selectedFacultyId) return;
    setAddingDepartment(true);
    setMessage("");
    try {
      const { error } = await supabase.from("departments").insert({
        faculty_id: selectedFacultyId,
        name,
      });
      if (error) {
        setMessage(errorText(error));
        return;
      }
      setDepartmentName("");
      setMessage("Department added to the selected faculty.");
      await loadFaculties();
    } finally {
      setAddingDepartment(false);
    }
  };

  const saveFacultyName = async (faculty: Faculty) => {
    const name = editingFacultyName.trim();
    if (name.length < 2 || busyId) return;
    setBusyId(faculty.id);
    setMessage("");
    try {
      const { error } = await supabase.from("faculties").update({ name }).eq("id", faculty.id);
      if (error) {
        setMessage(errorText(error));
        return;
      }
      setEditingFacultyId(null);
      setEditingFacultyName("");
      setMessage("Faculty name updated.");
      await loadFaculties();
    } finally {
      setBusyId(null);
    }
  };

  const saveDepartmentName = async (department: Department) => {
    const name = editingDepartmentName.trim();
    if (name.length < 2 || busyId) return;
    setBusyId(department.id);
    setMessage("");
    try {
      const { error } = await supabase.from("departments").update({ name }).eq("id", department.id);
      if (error) {
        setMessage(errorText(error));
        return;
      }
      setEditingDepartmentId(null);
      setEditingDepartmentName("");
      setMessage("Department name updated.");
      await loadFaculties();
    } finally {
      setBusyId(null);
    }
  };

  const toggleFaculty = async (faculty: Faculty) => {
    if (busyId) return;
    setBusyId(faculty.id);
    setMessage("");
    try {
      const { error } = await supabase.from("faculties")
        .update({ is_active: !faculty.is_active })
        .eq("id", faculty.id);
      if (error) {
        setMessage(errorText(error));
        return;
      }
      setMessage(faculty.is_active
        ? "Faculty deactivated. Its departments are hidden from new staff selections until it is reactivated."
        : "Faculty reactivated.");
      await loadFaculties();
    } finally {
      setBusyId(null);
    }
  };

  const toggleDepartment = async (department: Department) => {
    if (busyId) return;
    setBusyId(department.id);
    setMessage("");
    try {
      const { error } = await supabase.from("departments")
        .update({ is_active: !department.is_active })
        .eq("id", department.id);
      if (error) {
        setMessage(errorText(error));
        return;
      }
      setMessage(department.is_active ? "Department deactivated." : "Department reactivated.");
      await loadFaculties();
    } finally {
      setBusyId(null);
    }
  };

  const activeFacultyCount = faculties.filter((faculty) => faculty.is_active).length;
  const activeDepartmentCount = faculties.reduce(
    (count, faculty) => count + (faculty.is_active ? faculty.departments.filter((department) => department.is_active).length : 0),
    0,
  );

  return (
    <>
      <div className="page-heading academic-page-heading">
        <div>
          <div className="eyebrow">ADMINISTRATOR / ACADEMIC STRUCTURE</div>
          <h1>Faculties and departments</h1>
          <p>Create and maintain the academic structure used by student records.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          <Building2 size={16} /> Back to Settings
        </button>
      </div>

      <section className="stats-grid">
        <article className="stat-card"><div className="stat-icon"><Building2 size={19}/></div><div className="stat-copy"><span>Active faculties</span><strong>{activeFacultyCount}</strong><small>Available in the catalogue</small></div></article>
        <article className="stat-card"><div className="stat-icon"><ChevronDown size={19}/></div><div className="stat-copy"><span>Active departments</span><strong>{activeDepartmentCount}</strong><small>Under active faculties</small></div></article>
        <article className="stat-card"><div className="stat-icon"><RefreshCw size={19}/></div><div className="stat-copy"><span>Total faculties</span><strong>{faculties.length}</strong><small>Including inactive records</small></div></article>
      </section>

      {message && <div className="student-form-message" role="status"><span>{message}</span><button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={15}/></button></div>}

      <section className="panel academic-admin-panel">
        <div className="panel-heading"><div><div className="eyebrow">ADD FACULTY</div><h2>Academic faculties</h2><p>Faculty names must be unique across the institution.</p></div></div>
        <form className="academic-add-form" onSubmit={addFaculty}>
          <label className="field"><span>Faculty name</span><input value={facultyName} onChange={(event) => setFacultyName(event.target.value)} placeholder="e.g. Faculty of Engineering" maxLength={120} minLength={2} required disabled={addingFaculty}/></label>
          <button className="primary-button" type="submit" disabled={addingFaculty || facultyName.trim().length < 2}><Plus size={16}/>{addingFaculty ? "Adding..." : "Add faculty"}</button>
        </form>
      </section>

      <section className="panel academic-admin-panel">
        <div className="panel-heading"><div><div className="eyebrow">ADD DEPARTMENT</div><h2>Departments</h2><p>Each department belongs to one faculty.</p></div></div>
        <form className="academic-add-form" onSubmit={addDepartment}>
          <label className="field"><span>Faculty</span><select value={selectedFacultyId} onChange={(event) => setSelectedFacultyId(event.target.value)} required disabled={addingDepartment}><option value="" disabled>Select faculty</option>{faculties.filter((faculty) => faculty.is_active).map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.name}</option>)}</select></label>
          <label className="field"><span>Department name</span><input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="e.g. Computer Science" maxLength={120} minLength={2} required disabled={addingDepartment || activeFacultyCount === 0}/></label>
          <button className="primary-button" type="submit" disabled={addingDepartment || !selectedFacultyId || departmentName.trim().length < 2}><Plus size={16}/>{addingDepartment ? "Adding..." : "Add department"}</button>
        </form>
      </section>

      <section className="panel academic-admin-panel">
        <div className="panel-heading"><div><div className="eyebrow">SAVED STRUCTURE</div><h2>Faculty directory</h2><p>Rename and deactivate records. Existing student references are not erased.</p></div></div>
        {loading ? <div className="student-directory-loading">Loading faculties and departments...</div> : faculties.length === 0 ? <div className="course-admin-empty">No faculties have been added yet.</div> : (
          <div className="academic-faculty-list">
            {faculties.map((faculty) => (
              <article className="academic-faculty-card" key={faculty.id}>
                <div className="academic-faculty-head">
                  <div className="academic-record-main">
                    {editingFacultyId === faculty.id
                      ? <input className="course-admin-edit-input" value={editingFacultyName} onChange={(event) => setEditingFacultyName(event.target.value)} aria-label="Faculty name"/>
                      : <strong>{faculty.name}</strong>}
                    <span className={faculty.is_active ? "course-admin-status active" : "course-admin-status inactive"}>{faculty.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="course-admin-actions">
                    {editingFacultyId === faculty.id ? <>
                      <button className="course-admin-text-button" type="button" onClick={() => void saveFacultyName(faculty)} disabled={busyId === faculty.id || editingFacultyName.trim().length < 2}><Check size={13}/> Save</button>
                      <button className="course-admin-text-button" type="button" onClick={() => setEditingFacultyId(null)}><X size={13}/> Cancel</button>
                    </> : <>
                      <button className="course-admin-text-button" type="button" onClick={() => {setEditingFacultyId(faculty.id);setEditingFacultyName(faculty.name);}}><Pencil size={13}/> Rename</button>
                      <button className={faculty.is_active ? "course-admin-status-button deactivate" : "course-admin-status-button activate"} type="button" onClick={() => void toggleFaculty(faculty)} disabled={busyId === faculty.id}>{faculty.is_active ? "Deactivate" : "Reactivate"}</button>
                    </>}
                  </div>
                </div>
                <div className="academic-department-list">
                  {faculty.departments.length === 0 ? <p>No departments added under this faculty.</p> : faculty.departments.map((department) => (
                    <div className="academic-department-row" key={department.id}>
                      <div className="academic-record-main">
                        {editingDepartmentId === department.id
                          ? <input className="course-admin-edit-input" value={editingDepartmentName} onChange={(event) => setEditingDepartmentName(event.target.value)} aria-label="Department name"/>
                          : <span>{department.name}</span>}
                        <span className={department.is_active && faculty.is_active ? "course-admin-status active" : "course-admin-status inactive"}>{department.is_active && faculty.is_active ? "Active" : "Inactive"}</span>
                      </div>
                      <div className="course-admin-actions">
                        {editingDepartmentId === department.id ? <>
                          <button className="course-admin-text-button" type="button" onClick={() => void saveDepartmentName(department)} disabled={busyId === department.id || editingDepartmentName.trim().length < 2}><Check size={13}/> Save</button>
                          <button className="course-admin-text-button" type="button" onClick={() => setEditingDepartmentId(null)}><X size={13}/> Cancel</button>
                        </> : <>
                          <button className="course-admin-text-button" type="button" onClick={() => {setEditingDepartmentId(department.id);setEditingDepartmentName(department.name);}}><Pencil size={13}/> Rename</button>
                          <button className={department.is_active ? "course-admin-status-button deactivate" : "course-admin-status-button activate"} type="button" onClick={() => void toggleDepartment(department)} disabled={busyId === department.id}>{department.is_active ? "Deactivate" : "Reactivate"}</button>
                        </>}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

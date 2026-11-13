import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Info,
  Lock,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  X
} from "lucide-react";
import "./styles.css";

type MainTab = "registration" | "attendance";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

const COURSES = [
  "English",
  "Mathematics",
  "Igbo",
  "Physics",
  "Chemistry",
  "Biology",
  "Government",
  "Commerce",
  "Literature in English"
];

function App() {
  const [activeTab, setActiveTab] = useState<MainTab>("registration");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [toast, setToast] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showComingSoon = (feature: string) => {
    setToast(`${feature} will be connected in a later development task.`);
    setSettingsOpen(false);
    setMobileMenuOpen(false);
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      setToast("On Android, open your browser menu and choose “Install app” or “Add to Home screen” when available.");
      return;
    }

    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") {
      setToast("CampusFace installation accepted.");
    }
    setInstallPrompt(null);
  };

  const switchTab = (tab: MainTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setSettingsOpen(false);
  };

  return (
    <div className="app-layout">
      <aside className="desktop-sidebar">
        <Sidebar
          activeTab={activeTab}
          onNavigate={switchTab}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
          onSettingsAction={showComingSoon}
        />
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-brand">
            <div className="brand-symbol"><GraduationCap size={21} /></div>
            <div>
              <strong>CampusFace</strong>
              <span>Attendance workspace</span>
            </div>
          </div>

          <div className="topbar-right">
            <div className="staff-chip">
              <span className="staff-dot" />
              <span>Lecturer preview</span>
            </div>
            <button className="install-button" onClick={handleInstall} type="button">
              <ArrowRight size={16} />
              <span>Install app</span>
            </button>
          </div>
        </header>

        <main className="main-content">
          <div className="preview-notice">
            <Info size={17} />
            <span><strong>Preview mode.</strong> Data saving, staff sign-in and attendance processing are not connected yet.</span>
          </div>

          {activeTab === "registration" ? (
            <RegistrationPage onComingSoon={showComingSoon} />
          ) : (
            <AttendancePage onComingSoon={showComingSoon} />
          )}
        </main>

        <nav className="mobile-nav" aria-label="Main navigation">
          <button
            className={activeTab === "registration" ? "mobile-nav-item active" : "mobile-nav-item"}
            onClick={() => switchTab("registration")}
            type="button"
          >
            <UserPlus size={20} />
            <span>Registration</span>
          </button>
          <button
            className={activeTab === "attendance" ? "mobile-nav-item active" : "mobile-nav-item"}
            onClick={() => switchTab("attendance")}
            type="button"
          >
            <ClipboardCheck size={20} />
            <span>Attendance</span>
          </button>
          <button
            className={mobileMenuOpen ? "mobile-nav-item active" : "mobile-nav-item"}
            onClick={() => setMobileMenuOpen((open) => !open)}
            type="button"
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </nav>

        {mobileMenuOpen && (
          <div className="mobile-settings-panel">
            <div className="mobile-settings-head">
              <strong>Restricted settings</strong>
              <button type="button" aria-label="Close settings" onClick={() => setMobileMenuOpen(false)}><X size={18} /></button>
            </div>
            <button type="button" onClick={() => showComingSoon("Course catalogue")}>Course catalogue <Lock size={14} /></button>
            <button type="button" onClick={() => showComingSoon("Faculty and departments")}>Faculties & departments <Lock size={14} /></button>
            <button type="button" onClick={() => showComingSoon("Staff and permissions")}>Staff & permissions <Lock size={14} /></button>
            <p>These controls will require administrator access.</p>
          </div>
        )}

        {toast && (
          <div className="toast-message" role="status">
            <Info size={17} />
            <span>{toast}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setToast("")}><X size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

type SidebarProps = {
  activeTab: MainTab;
  onNavigate: (tab: MainTab) => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onSettingsAction: (feature: string) => void;
};

function Sidebar({
  activeTab,
  onNavigate,
  settingsOpen,
  onToggleSettings,
  onSettingsAction
}: SidebarProps) {
  return (
    <div className="sidebar-content">
      <div className="sidebar-brand">
        <div className="sidebar-logo"><GraduationCap size={25} /></div>
        <div>
          <strong>CampusFace</strong>
          <span>ATTENDANCE</span>
        </div>
      </div>

      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        <button
          type="button"
          className={activeTab === "registration" ? "sidebar-link selected" : "sidebar-link"}
          onClick={() => onNavigate("registration")}
        >
          <UserPlus size={19} />
          <span>Registration</span>
          {activeTab === "registration" && <span className="nav-indicator" />}
        </button>
        <button
          type="button"
          className={activeTab === "attendance" ? "sidebar-link selected" : "sidebar-link"}
          onClick={() => onNavigate("attendance")}
        >
          <ClipboardCheck size={19} />
          <span>Attendance</span>
          {activeTab === "attendance" && <span className="nav-indicator" />}
        </button>
      </nav>

      <div className="sidebar-divider" />
      <div className="sidebar-section-label">ADMINISTRATION</div>
      <div className="settings-wrap">
        <button
          className={settingsOpen ? "sidebar-link settings-link selected-soft" : "sidebar-link settings-link"}
          type="button"
          aria-expanded={settingsOpen}
          onClick={onToggleSettings}
        >
          <Settings size={19} />
          <span>Restricted settings</span>
          <ChevronDown className={settingsOpen ? "chevron rotated" : "chevron"} size={16} />
        </button>

        {settingsOpen && (
          <div className="settings-dropdown">
            <button type="button" onClick={() => onSettingsAction("Course catalogue")}>
              <BookOpen size={16} />
              <span>Course catalogue</span>
              <Lock size={13} />
            </button>
            <button type="button" onClick={() => onSettingsAction("Faculties and departments")}>
              <Building2 size={16} />
              <span>Faculties & departments</span>
              <Lock size={13} />
            </button>
            <button type="button" onClick={() => onSettingsAction("Staff and permissions")}>
              <ShieldCheck size={16} />
              <span>Staff & permissions</span>
              <Lock size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-spacer" />
      <div className="sidebar-security">
        <div className="security-icon"><ShieldCheck size={19} /></div>
        <div>
          <strong>Staff access only</strong>
          <span>Student accounts are not provided.</span>
        </div>
      </div>
      <div className="sidebar-profile">
        <div className="profile-avatar">L</div>
        <div className="profile-copy">
          <strong>Lecturer workspace</strong>
          <span>Preview session</span>
        </div>
        <span className="profile-status" />
      </div>
    </div>
  );
}

type PageActionProps = {
  onComingSoon: (feature: string) => void;
};

function RegistrationPage({ onComingSoon }: PageActionProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);

  const toggleCourse = (course: string) => {
    setSelectedCourses((current) =>
      current.includes(course)
        ? current.filter((item) => item !== course)
        : [...current, course]
    );
  };

  const preventPreviewSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onComingSoon("Student registration");
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">STUDENT RECORDS</div>
          <h1>Registration</h1>
          <p>Register students, organise course enrolments and prepare face profiles.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? <X size={18} /> : <Plus size={18} />}
          {formOpen ? "Close form" : "Register student"}
        </button>
      </div>

      <section className="stats-grid" aria-label="Registration overview">
        <StatCard icon={<Users size={19} />} label="Registered students" value="0" note="Student records" />
        <StatCard icon={<BookOpen size={19} />} label="Available courses" value={String(COURSES.length)} note="Initial course catalogue" />
        <StatCard icon={<Camera size={19} />} label="Face profiles" value="0" note="Setup planned for Task 7" />
      </section>

      {formOpen && (
        <section className="panel registration-form-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">NEW RECORD</div>
              <h2>Student information</h2>
              <p>Complete the academic details before face registration is introduced.</p>
            </div>
            <span className="step-tag">STEP 1 OF 2</span>
          </div>

          <form onSubmit={preventPreviewSubmit}>
            <div className="form-grid">
              <label className="field full-field">
                <span>Full name</span>
                <input type="text" placeholder="Enter student's full name" autoComplete="off" />
              </label>
              <label className="field">
                <span>Registration number</span>
                <input type="text" placeholder="e.g. 2026/000000" autoComplete="off" />
              </label>
              <label className="field">
                <span>Gender</span>
                <select defaultValue="">
                  <option value="" disabled>Select gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              <label className="field">
                <span>Faculty</span>
                <input type="text" placeholder="Enter faculty" autoComplete="off" />
              </label>
              <label className="field">
                <span>Department</span>
                <input type="text" placeholder="Enter department" autoComplete="off" />
              </label>
            </div>

            <div className="course-picker">
              <div className="course-picker-heading">
                <div>
                  <strong>Courses offered</strong>
                  <span>Select all courses this student is enrolled in.</span>
                </div>
                <span className="selection-count">{selectedCourses.length} selected</span>
              </div>
              <div className="course-options">
                {COURSES.map((course) => (
                  <label key={course} className={selectedCourses.includes(course) ? "course-option checked" : "course-option"}>
                    <input
                      type="checkbox"
                      checked={selectedCourses.includes(course)}
                      onChange={() => toggleCourse(course)}
                    />
                    <span className="custom-check">{selectedCourses.includes(course) && <Check size={13} />}</span>
                    <span>{course}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="face-registration-note">
              <div className="face-note-icon"><Camera size={20} /></div>
              <div>
                <strong>Face registration comes next</strong>
                <p>Camera checks, student permission and biometric template handling will be added in Task 7, after the secure registration workflow is ready.</p>
              </div>
              <span className="locked-pill"><Lock size={12} /> Not active</span>
            </div>

            <div className="form-footer">
              <p><Lock size={14} /> Saving is disabled in this preview. No student information is stored.</p>
              <button type="submit" className="secondary-button">Save student <ArrowRight size={16} /></button>
            </div>
          </form>
        </section>
      )}

      <section className="panel records-panel">
        <div className="records-toolbar">
          <div>
            <h2>Student directory</h2>
            <p>Student records created by authorised staff.</p>
          </div>
          <div className="search-wrap">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student or reg. number"
              aria-label="Search student directory"
            />
          </div>
        </div>

        <div className="table-scroll">
          <table className="records-table">
            <thead>
              <tr>
                <th>STUDENT</th>
                <th>REGISTRATION NUMBER</th>
                <th>FACULTY / DEPARTMENT</th>
                <th>COURSES</th>
                <th>FACE PROFILE</th>
              </tr>
            </thead>
          </table>
        </div>
        <EmptyState
          icon={<Users size={25} />}
          title={search ? "No matching student records" : "No students registered yet"}
          description={search ? "The directory is empty in preview mode. Student search will work with connected records." : "Use Register student to preview the student details form. Records will appear here after the database is connected."}
        />
      </section>
    </>
  );
}

function AttendancePage({ onComingSoon }: PageActionProps) {
  const [formOpen, setFormOpen] = useState(false);

  const preventPreviewSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onComingSoon("Attendance session creation");
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CLASS MANAGEMENT</div>
          <h1>Attendance</h1>
          <p>Create class sessions, scan eligible students and review attendance.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? <X size={18} /> : <Plus size={18} />}
          {formOpen ? "Close form" : "Create attendance"}
        </button>
      </div>

      <section className="stats-grid" aria-label="Attendance overview">
        <StatCard icon={<CalendarDays size={19} />} label="Attendance sessions" value="0" note="Sessions created" />
        <StatCard icon={<Users size={19} />} label="Students present" value="0" note="Across all sessions" />
        <StatCard icon={<FileText size={19} />} label="Reports available" value="0" note="Completed classes" />
      </section>

      {formOpen && (
        <section className="panel attendance-form-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">NEW CLASS SESSION</div>
              <h2>Create attendance</h2>
              <p>Set up the class before starting the lecturer's attendance scan.</p>
            </div>
            <span className="step-tag">SESSION SETUP</span>
          </div>
          <form onSubmit={preventPreviewSubmit}>
            <div className="form-grid">
              <label className="field">
                <span>Course</span>
                <select defaultValue="">
                  <option value="" disabled>Select course</option>
                  {COURSES.map((course) => <option value={course} key={course}>{course}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Class title</span>
                <input type="text" placeholder="e.g. Week 1 Lecture" />
              </label>
              <label className="field">
                <span>Class date</span>
                <input type="date" />
              </label>
              <label className="field">
                <span>Start time</span>
                <input type="time" />
              </label>
            </div>
            <div className="session-rule">
              <ShieldCheck size={19} />
              <p>At session start, the eligible course enrolment list will be saved as a fixed snapshot. Later enrolment changes will not alter this class's attendance denominator.</p>
            </div>
            <div className="form-footer">
              <p><Lock size={14} /> Session creation is disabled until the database workflow is added.</p>
              <button type="submit" className="secondary-button">Start attendance <ArrowRight size={16} /></button>
            </div>
          </form>
        </section>
      )}

      <section className="panel records-panel">
        <div className="records-toolbar">
          <div>
            <h2>Recent sessions</h2>
            <p>Attendance sessions and their current status.</p>
          </div>
          <div className="table-caption"><Clock size={15} /> Latest first</div>
        </div>
        <div className="table-scroll">
          <table className="records-table attendance-table">
            <thead>
              <tr>
                <th>CLASS</th>
                <th>COURSE</th>
                <th>DATE & TIME</th>
                <th>PRESENT</th>
                <th>STATUS</th>
              </tr>
            </thead>
          </table>
        </div>
        <EmptyState
          icon={<ClipboardList size={25} />}
          title="No attendance sessions yet"
          description="Your class sessions will appear here once attendance creation and secure storage are connected."
        />
      </section>
    </>
  );
}

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
};

function StatCard({ icon, label, value, note }: StatCardProps) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
};

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export default App;

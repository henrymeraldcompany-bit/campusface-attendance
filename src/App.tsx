import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Download,
  FileText,
  GraduationCap,
  Info,
  Lock,
  LogOut,
  Moon,
  Palette,
  Sun,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  X
} from "lucide-react";
import "./styles.css";
import type { StaffProfile } from "./auth/AuthGate";
import { CourseCataloguePage, type CourseRecord } from "./admin/CourseCataloguePage";
import { supabase } from "./lib/supabase";

type MainTab = "registration" | "attendance";
type ThemeMode = "light" | "dark";

const ACCENT_PRESETS = [
  { name: "Ocean", value: "#167b7b" },
  { name: "Blue", value: "#2563eb" },
  { name: "Emerald", value: "#15803d" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Rose", value: "#e11d48" },
  { name: "Amber", value: "#b45309" },
  { name: "Cyan", value: "#0891b2" },
  { name: "Slate", value: "#475569" }
];

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function darkenHex(hex: string, amount = 0.18) {
  const { r, g, b } = hexToRgb(hex);
  return "#" + [r, g, b]
    .map((channel) => Math.round(channel * (1 - amount)).toString(16).padStart(2, "0"))
    .join("");
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

function isRunningAsInstalledApp() {
  if (typeof window === "undefined") return false;
  const modes = ["standalone", "fullscreen", "minimal-ui"];
  return modes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function App({ staffProfile, onSignOut }: { staffProfile: StaffProfile; onSignOut: () => Promise<void> }) {
  const [activeTab, setActiveTab] = useState<MainTab>("registration");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isRunningAsInstalledApp);
  const [toast, setToast] = useState("");
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [adminPage, setAdminPage] = useState<"workspace" | "settings" | "courses">("workspace");
  const isAdministrator = staffProfile.staff_role === "administrator";
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return localStorage.getItem("campusface-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [accentColor, setAccentColor] = useState(() => {
    try {
      const saved = localStorage.getItem("campusface-accent");
      return saved && /^#[0-9a-fA-F]{6}$/.test(saved) ? saved : "#167b7b";
    } catch {
      return "#167b7b";
    }
  });

  useEffect(() => {
    const displayModeQueries = ["standalone", "fullscreen", "minimal-ui"].map((mode) =>
      window.matchMedia(`(display-mode: ${mode})`)
    );

    const updateInstalledState = () => setIsInstalled(isRunningAsInstalledApp());
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    updateInstalledState();
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    displayModeQueries.forEach((query) => query.addEventListener("change", updateInstalledState));

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      displayModeQueries.forEach((query) => query.removeEventListener("change", updateInstalledState));
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const { r, g, b } = hexToRgb(accentColor);
    root.dataset.theme = theme;
    root.style.setProperty("--accent", accentColor);
    root.style.setProperty("--accent-dark", darkenHex(accentColor));
    root.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, .11)`);
    root.style.setProperty("--accent-rgb", `${r}, ${g}, ${b}`);

    try {
      localStorage.setItem("campusface-theme", theme);
      localStorage.setItem("campusface-accent", accentColor);
    } catch {
      // Appearance remains active for this visit if browser storage is unavailable.
    }
  }, [theme, accentColor]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let mounted = true;
    const loadCatalogue = async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, is_active")
        .order("name", { ascending: true });

      if (!mounted) return;
      if (error) {
        setCourses([]);
        setToast("The course catalogue could not be loaded. Check your connection and staff access.");
      } else {
        setCourses((data ?? []) as CourseRecord[]);
      }
      setCoursesLoading(false);
    };

    void loadCatalogue();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshCourses = async () => {
    setCoursesLoading(true);
    const { data, error } = await supabase
      .from("courses")
      .select("id, name, is_active")
      .order("name", { ascending: true });

    if (error) {
      setToast("The course catalogue could not be refreshed. Check your connection and staff access.");
    } else {
      setCourses((data ?? []) as CourseRecord[]);
    }
    setCoursesLoading(false);
  };

  const activeCourses = courses.filter((course) => course.is_active);

  const handleInstall = async () => {
    if (isInstalled) return;

    const promptEvent = installPrompt;
    if (!promptEvent) {
      setToast("Chrome has not made the installation prompt available yet. Open this website in Chrome and use the browser menu's “Install app” option when it appears. Do not choose “Add to Home screen”.");
      return;
    }

    setInstallPrompt(null);
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      setToast("CampusFace installation accepted.");
    }
  };

  const showComingSoon = (feature: string) => {
    setToast(`${feature} will be connected in a later development task.`);
  };

  const switchTab = (tab: MainTab) => {
    setActiveTab(tab);
    setAdminPage("workspace");
  };

  const openSettings = () => setAdminPage("settings");

  return (
    <div className="app-layout">
      <aside className="desktop-sidebar">
        <Sidebar
          activeTab={activeTab}
          onNavigate={switchTab}
          activePage={adminPage}
          onOpenSettings={openSettings}
          isAdministrator={isAdministrator}
          staffProfile={staffProfile}
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
              <span>{staffProfile.full_name} · {staffProfile.staff_role === "administrator" ? "Administrator" : "Lecturer"}</span>
            </div>
            <button
              className={adminPage === "workspace" ? "topbar-settings" : "topbar-settings active"}
              type="button"
              aria-label="Open Settings"
              aria-current={adminPage === "settings" ? "page" : undefined}
              onClick={openSettings}
            >
              <Settings size={17} />
            </button>
            {!isInstalled && (
              <button className="install-button" onClick={handleInstall} type="button">
                <Download size={16} />
                <span>Install app</span>
              </button>
            )}
          </div>
        </header>

        <main className="main-content">
          {adminPage === "settings" ? (
            <div className="settings-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">PREFERENCES & ACCOUNT</div>
                  <h1>Settings</h1>
                  <p>Manage your CampusFace appearance, account and available controls.</p>
                </div>
              </div>

              <section className="panel settings-section">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">PERSONALISE</div>
                    <h2>Appearance</h2>
                    <p>Choose how CampusFace looks on this device.</p>
                  </div>
                  <Palette size={20} />
                </div>
                <AppearanceSettings
                  theme={theme}
                  onThemeChange={setTheme}
                  accentColor={accentColor}
                  onAccentChange={setAccentColor}
                />
              </section>

              {isAdministrator && (
                <section className="panel settings-section">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">ADMINISTRATOR CONTROLS</div>
                      <h2>Academic and staff management</h2>
                      <p>These controls are available only to authorised administrators.</p>
                    </div>
                    <ShieldCheck size={20} />
                  </div>
                  <button className="settings-action-row" type="button" onClick={() => setAdminPage("courses")}>
                    <span className="settings-action-icon"><BookOpen size={18} /></span>
                    <span className="settings-action-copy">
                      <strong>Course catalogue</strong>
                      <small>Add, rename, activate or deactivate courses</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                  <button className="settings-action-row" type="button" onClick={() => showComingSoon("Faculty and department management")}>
                    <span className="settings-action-icon"><Building2 size={18} /></span>
                    <span className="settings-action-copy">
                      <strong>Faculties and departments</strong>
                      <small>Academic structure management</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                  <button className="settings-action-row" type="button" onClick={() => showComingSoon("Staff and permissions")}>
                    <span className="settings-action-icon"><Users size={18} /></span>
                    <span className="settings-action-copy">
                      <strong>Staff and permissions</strong>
                      <small>Manage lecturer accounts and access roles</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                </section>
              )}

              <section className="panel settings-section settings-account-section">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">SIGNED-IN ACCOUNT</div>
                    <h2>Account</h2>
                    <p>Your CampusFace staff identity and access status.</p>
                  </div>
                  <ShieldCheck size={20} />
                </div>
                <div className="settings-account-details">
                  <div className="settings-account-avatar">
                    {staffProfile.full_name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="settings-account-copy">
                    <strong>{staffProfile.full_name}</strong>
                    <span>{staffProfile.staff_role === "administrator" ? "Administrator" : "Lecturer"}</span>
                    <small><span className="staff-dot" /> Active staff access</small>
                  </div>
                </div>
                <div className="settings-signout-area">
                  <div>
                    <strong>Sign out of CampusFace</strong>
                    <span>End your current staff session on this device.</span>
                  </div>
                  <button className="settings-signout-button" type="button" onClick={() => void onSignOut()}>
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </section>
            </div>
          ) : adminPage === "courses" && isAdministrator ? (
            <CourseCataloguePage
              courses={courses}
              loading={coursesLoading}
              onBack={() => setAdminPage("settings")}
              onRefresh={refreshCourses}
            />
          ) : (
            <>
              <div className="preview-notice">
                <Info size={17} />
                <span><strong>Staff access verified.</strong> Student records, camera capture and attendance processing will be connected in later tasks.</span>
              </div>

              {activeTab === "registration" ? (
                <RegistrationPage courses={activeCourses} />
              ) : (
                <AttendancePage onComingSoon={showComingSoon} courses={activeCourses} />
              )}
            </>
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
        </nav>

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
  activePage: "workspace" | "settings" | "courses";
  onOpenSettings: () => void;
  isAdministrator: boolean;
  staffProfile: StaffProfile;
};

function Sidebar({
  activeTab,
  onNavigate,
  activePage,
  onOpenSettings,
  isAdministrator,
  staffProfile
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
          className={activeTab === "registration" && activePage === "workspace" ? "sidebar-link selected" : "sidebar-link"}
          onClick={() => onNavigate("registration")}
        >
          <UserPlus size={19} />
          <span>Registration</span>
          {activeTab === "registration" && activePage === "workspace" && <span className="nav-indicator" />}
        </button>
        <button
          type="button"
          className={activeTab === "attendance" && activePage === "workspace" ? "sidebar-link selected" : "sidebar-link"}
          onClick={() => onNavigate("attendance")}
        >
          <ClipboardCheck size={19} />
          <span>Attendance</span>
          {activeTab === "attendance" && activePage === "workspace" && <span className="nav-indicator" />}
        </button>
      </nav>

      <div className="sidebar-divider" />
      <div className="sidebar-section-label">ACCOUNT</div>
      <nav className="sidebar-nav" aria-label="Account navigation">
        <button
          type="button"
          className={activePage === "settings" || activePage === "courses" ? "sidebar-link selected" : "sidebar-link"}
          onClick={onOpenSettings}
        >
          <Settings size={19} />
          <span>Settings</span>
          {(activePage === "settings" || activePage === "courses") && <span className="nav-indicator" />}
        </button>
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-security">
        <div className="security-icon"><ShieldCheck size={19} /></div>
        <div>
          <strong>Staff access only</strong>
          <span>Student accounts are not provided.</span>
        </div>
      </div>
      <div className="sidebar-profile">
        <div className="profile-avatar">{staffProfile.full_name.trim().charAt(0).toUpperCase()}</div>
        <div className="profile-copy">
          <strong>{staffProfile.full_name}</strong>
          <span>{isAdministrator ? "Administrator" : "Lecturer"}</span>
        </div>
        <span className="profile-status" />
      </div>
    </div>
  );
}

type AppearanceSettingsProps = {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  accentColor: string;
  onAccentChange: (color: string) => void;
};

function AppearanceSettings({
  theme,
  onThemeChange,
  accentColor,
  onAccentChange
}: AppearanceSettingsProps) {
  return (
    <section className="appearance-settings" aria-label="Appearance settings">
      <div className="appearance-title"><Palette size={15} /> APPEARANCE</div>
      <div className="appearance-theme-control" aria-label="Choose app theme">
        <button
          type="button"
          className={theme === "light" ? "appearance-theme active" : "appearance-theme"}
          aria-pressed={theme === "light"}
          onClick={() => onThemeChange("light")}
        >
          <Sun size={14} /> Light
        </button>
        <button
          type="button"
          className={theme === "dark" ? "appearance-theme active" : "appearance-theme"}
          aria-pressed={theme === "dark"}
          onClick={() => onThemeChange("dark")}
        >
          <Moon size={14} /> Dark
        </button>
      </div>
      <div className="accent-picker-heading">
        <span>Accent colour</span>
        <span>{ACCENT_PRESETS.find((item) => item.value.toLowerCase() === accentColor.toLowerCase())?.name ?? "Custom"}</span>
      </div>
      <div className="accent-swatches">
        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={accentColor.toLowerCase() === preset.value.toLowerCase() ? "accent-swatch selected" : "accent-swatch"}
            style={{ backgroundColor: preset.value }}
            aria-label={`Use ${preset.name} accent colour`}
            aria-pressed={accentColor.toLowerCase() === preset.value.toLowerCase()}
            title={preset.name}
            onClick={() => onAccentChange(preset.value)}
          />
        ))}
        <label className="custom-accent-control" title="Choose a custom accent colour">
          <input
            type="color"
            value={accentColor}
            aria-label="Choose custom accent colour"
            onChange={(event) => onAccentChange(event.target.value)}
          />
          <span>+</span>
        </label>
      </div>
      <p className="appearance-save-note">Your appearance choices are saved on this device.</p>
    </section>
  );
}

type PageActionProps = {
  onComingSoon: (feature: string) => void;
  courses: CourseRecord[];
};

function RegistrationPage({ onComingSoon, courses }: PageActionProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [courseSearch, setCourseSearch] = useState("");

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
        <StatCard icon={<BookOpen size={19} />} label="Available courses" value={String(courses.length)} note="Active catalogue courses" />
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
              <label className="course-search-wrap">
                <Search size={15} />
                <input
                  value={courseSearch}
                  onChange={(event) => setCourseSearch(event.target.value)}
                  placeholder="Find a course"
                  aria-label="Search available courses"
                />
              </label>
              <div className="course-options">
                {courses
                  .filter((course) => course.name.toLowerCase().includes(courseSearch.trim().toLowerCase()))
                  .map((course) => (
                    <label key={course.id} className={selectedCourses.includes(course.name) ? "course-option checked" : "course-option"}>
                      <input
                        type="checkbox"
                        checked={selectedCourses.includes(course.name)}
                        onChange={() => toggleCourse(course.name)}
                      />
                      <span className="custom-check">{selectedCourses.includes(course.name) && <Check size={13} />}</span>
                      <span>{course.name}</span>
                    </label>
                  ))}
                {courses.length === 0 && (
                  <p className="course-list-empty">No active courses are available. Ask an administrator to add or activate courses.</p>
                )}
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

function AttendancePage({ onComingSoon, courses }: PageActionProps) {
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
                  {courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}
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

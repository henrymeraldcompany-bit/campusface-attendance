import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft,
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
  Pencil,
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
import { AcademicStructurePage } from "./admin/AcademicStructurePage";
import { StaffManagementPage } from "./admin/StaffManagementPage";
import { supabase } from "./lib/supabase";
import { EditStudentDialog, type ManagedStudentRecord } from "./registration/EditStudentDialog";
import { FaceRegistrationReadinessPage } from "./registration/FaceRegistrationReadinessPage";
import { SessionRosterPage, type SessionRosterSummary } from "./attendance/SessionRosterPage";

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
  const [adminPage, setAdminPage] = useState<"workspace" | "settings" | "courses" | "face-readiness" | "academic-structure" | "staff-management">("workspace");
  const [faceReadinessStudent, setFaceReadinessStudent] = useState<ManagedStudentRecord | null>(null);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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

  const switchTab = (tab: MainTab) => {
    setActiveTab(tab);
    setFaceReadinessStudent(null);
    setAdminPage("workspace");
  };

  const openFaceReadiness = (student: ManagedStudentRecord) => {
    setFaceReadinessStudent(student);
    setAdminPage("face-readiness");
  };

  const openSettings = () => setAdminPage("settings");

  const confirmSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
      setSignOutConfirmOpen(false);
    }
  };

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
              <div className="page-heading settings-page-heading">
                <div>
                  <div className="eyebrow">PREFERENCES & ACCOUNT</div>
                  <h1>Settings</h1>
                  <p>Manage your CampusFace appearance, account and available controls.</p>
                </div>
                <button className="secondary-button settings-back-button" type="button" onClick={() => setAdminPage("workspace")}>
                  <ArrowLeft size={16} />
                  Back to workspace
                </button>
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
                  <button className="settings-action-row" type="button" onClick={() => setAdminPage("academic-structure")}>
                    <span className="settings-action-icon"><Building2 size={18} /></span>
                    <span className="settings-action-copy">
                      <strong>Faculties and departments</strong>
                      <small>Academic structure management</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                  <button className="settings-action-row" type="button" onClick={() => setAdminPage("staff-management")}>
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
                  <button className="settings-signout-button" type="button" onClick={() => setSignOutConfirmOpen(true)}>
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
          ) : adminPage === "academic-structure" && isAdministrator ? (
            <AcademicStructurePage onBack={() => setAdminPage("settings")} />
          ) : adminPage === "staff-management" && isAdministrator ? (
            <StaffManagementPage onBack={() => setAdminPage("settings")} />
          ) : adminPage === "face-readiness" && faceReadinessStudent ? (
            <FaceRegistrationReadinessPage
              student={faceReadinessStudent}
              onBack={() => setAdminPage("workspace")}
            />
          ) : (
            <>
              <div className="preview-notice">
                <Info size={17} />
                <span><strong>Staff access verified.</strong> Student records, camera capture and attendance processing will be connected in later tasks.</span>
              </div>

              {activeTab === "registration" ? (
                <RegistrationPage courses={courses} onOpenFaceReadiness={openFaceReadiness} />
              ) : (
                <AttendancePage courses={activeCourses} />
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

        {signOutConfirmOpen && (
          <div className="confirmation-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !signingOut) setSignOutConfirmOpen(false);
          }}>
            <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="signout-confirm-title" aria-describedby="signout-confirm-description">
              <div className="confirmation-icon"><LogOut size={22} /></div>
              <h2 id="signout-confirm-title">Sign out of CampusFace?</h2>
              <p id="signout-confirm-description">You will leave your staff workspace and return to the sign-in screen. Any unsaved changes will be lost.</p>
              <div className="confirmation-actions">
                <button className="course-admin-text-button" type="button" onClick={() => setSignOutConfirmOpen(false)} disabled={signingOut}>
                  Stay signed in
                </button>
                <button className="settings-signout-button" type="button" onClick={() => void confirmSignOut()} disabled={signingOut}>
                  <LogOut size={16} />
                  {signingOut ? "Signing out..." : "Yes, sign out"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

type SidebarProps = {
  activeTab: MainTab;
  onNavigate: (tab: MainTab) => void;
  activePage: "workspace" | "settings" | "courses" | "face-readiness" | "academic-structure" | "staff-management";
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
          {(activePage === "settings" || activePage === "courses" || activePage === "academic-structure" || activePage === "staff-management") && <span className="nav-indicator" />}
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

type AcademicFacultyOption = { id: string; name: string; is_active: boolean };
type AcademicDepartmentOption = { id: string; faculty_id: string; name: string; is_active: boolean };
type StudentRecord = ManagedStudentRecord;

function RegistrationPage({ courses, onOpenFaceReadiness }: { courses: CourseRecord[]; onOpenFaceReadiness: (student: ManagedStudentRecord) => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [faculties, setFaculties] = useState<AcademicFacultyOption[]>([]);
  const [departments, setDepartments] = useState<AcademicDepartmentOption[]>([]);
  const [academicLoading, setAcademicLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [gender, setGender] = useState<"" | "female" | "male">("");
  const [facultyId, setFacultyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [editingStudent, setEditingStudent] = useState<ManagedStudentRecord | null>(null);
  const [studentStatusTarget, setStudentStatusTarget] = useState<ManagedStudentRecord | null>(null);
  const [updatingStudentStatus, setUpdatingStudentStatus] = useState(false);

  const loadStudents = async () => {
    setStudentsLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, full_name, registration_number, gender, faculty, department, faculty_id, department_id, is_active, student_courses(course_id, courses(name))")
      .order("full_name", { ascending: true });

    if (error) {
      setStudents([]);
      setFormMessage("Student records could not be loaded. Check your staff connection and database access.");
    } else {
      setStudents((data ?? []) as unknown as StudentRecord[]);
    }
    setStudentsLoading(false);
  };

  const loadAcademicStructure = async () => {
    setAcademicLoading(true);
    const [facultyResult, departmentResult] = await Promise.all([
      supabase.from("faculties").select("id, name, is_active").order("name", { ascending: true }),
      supabase.from("departments").select("id, faculty_id, name, is_active").order("name", { ascending: true }),
    ]);

    if (facultyResult.error || departmentResult.error) {
      setFaculties([]);
      setDepartments([]);
      setFormMessage("Faculty and department options could not be loaded. Ask the administrator to check the academic catalogue.");
    } else {
      setFaculties((facultyResult.data ?? []) as AcademicFacultyOption[]);
      setDepartments((departmentResult.data ?? []) as AcademicDepartmentOption[]);
    }
    setAcademicLoading(false);
  };

  useEffect(() => {
    void loadStudents();
    void loadAcademicStructure();
  }, []);

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((item) => item !== courseId)
        : [...current, courseId]
    );
  };

  const resetForm = () => {
    setFullName("");
    setRegistrationNumber("");
    setGender("");
    setFacultyId("");
    setDepartmentId("");
    setSelectedCourseIds([]);
    setCourseSearch("");
  };

  const confirmStudentStatusChange = async () => {
    const student = studentStatusTarget;
    if (!student || updatingStudentStatus) return;

    setUpdatingStudentStatus(true);
    setFormMessage("");
    try {
      const { error } = await supabase
        .from("students")
        .update({ is_active: !student.is_active })
        .eq("id", student.id);

      if (error) {
        setFormMessage(
          error.code === "42501"
            ? "Your staff account is not authorised to change this student status."
            : "The student status could not be updated. Check your connection and try again.",
        );
        return;
      }

      setStudentStatusTarget(null);
      setFormMessage(
        student.is_active
          ? "Student record archived. The record and course history have been retained."
          : "Student record reactivated successfully.",
      );
      await loadStudents();
    } finally {
      setUpdatingStudentStatus(false);
    }
  };

  const handleRegistrationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!facultyId || !departmentId) {
      setFormMessage("Select an active faculty and a department belonging to that faculty.");
      return;
    }

    if (selectedCourseIds.length === 0) {
      setFormMessage("Select at least one active course before saving the student.");
      return;
    }

    setSaving(true);
    setFormMessage("");

    try {
      const { error } = await supabase.rpc("register_student_with_academic_structure", {
        p_full_name: fullName.trim(),
        p_registration_number: registrationNumber.trim(),
        p_gender: gender,
        p_faculty_id: facultyId,
        p_department_id: departmentId,
        p_course_ids: selectedCourseIds,
      });

      if (error) {
        if (error.code === "23505") {
          setFormMessage("That registration number is already in the student directory. Check the number and try again.");
        } else if (error.code === "42501") {
          setFormMessage("Your staff account is not authorised to register students. Contact the CampusFace administrator.");
        } else if (error.code === "22023" || error.code === "23514") {
          setFormMessage(error.message || "Check the student details and selected courses.");
        } else {
          setFormMessage("The student could not be saved. Check your connection and try again.");
        }
        return;
      }

      resetForm();
      setFormOpen(false);
      setFormMessage("Student registered successfully, with the selected course enrolments saved.");
      await loadStudents();
    } finally {
      setSaving(false);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStudents = students.filter((student) => {
    if (!normalizedSearch) return true;
    return [
      student.full_name,
      student.registration_number,
      student.faculty,
      student.department,
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  const filteredCourses = courses.filter((course) =>
    course.is_active && course.name.toLowerCase().includes(courseSearch.trim().toLowerCase())
  );
  const activeCourseCount = courses.filter((course) => course.is_active).length;
  const activeFaculties = faculties.filter((facultyOption) => facultyOption.is_active);
  const availableDepartments = departments.filter((departmentOption) =>
    departmentOption.faculty_id === facultyId && departmentOption.is_active
  );
  const activeStudentCount = students.filter((student) => student.is_active).length;
  const archivedStudentCount = students.length - activeStudentCount;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">STUDENT RECORDS</div>
          <h1>Registration</h1>
          <p>Register students, assign their active courses and maintain the student directory.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => {
          setFormOpen((open) => !open);
          setFormMessage("");
        }}>
          {formOpen ? <X size={18} /> : <Plus size={18} />}
          {formOpen ? "Close form" : "Register student"}
        </button>
      </div>

      <section className="stats-grid" aria-label="Registration overview">
        <StatCard icon={<Users size={19} />} label="Active students" value={String(activeStudentCount)} note="Available student records" />
        <StatCard icon={<BookOpen size={19} />} label="Available courses" value={String(activeCourseCount)} note="Active catalogue courses" />
        <StatCard icon={<Lock size={19} />} label="Archived students" value={String(archivedStudentCount)} note="Retained historical records" />
      </section>

      {formMessage && (
        <div className="student-form-message" role="status">
          <Info size={16} />
          <span>{formMessage}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setFormMessage("")}><X size={15} /></button>
        </div>
      )}

      {formOpen && (
        <section className="panel registration-form-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">NEW STUDENT RECORD</div>
              <h2>Student information</h2>
              <p>Enter the student's academic details and select every course they are enrolled in.</p>
            </div>
            <span className="step-tag">STAFF ENTRY</span>
          </div>

          <form onSubmit={handleRegistrationSubmit}>
            <div className="form-grid">
              <label className="field full-field">
                <span>Full name</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Enter student's full name"
                  minLength={2}
                  maxLength={120}
                  autoComplete="off"
                  required
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>Registration number</span>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(event) => setRegistrationNumber(event.target.value)}
                  placeholder="e.g. 2026/000000"
                  minLength={2}
                  maxLength={60}
                  autoComplete="off"
                  required
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>Gender</span>
                <select
                  value={gender}
                  onChange={(event) => setGender(event.target.value as "" | "female" | "male")}
                  required
                  disabled={saving}
                >
                  <option value="" disabled>Select gender</option>
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
                  disabled={saving || academicLoading || activeFaculties.length === 0}
                >
                  <option value="" disabled>{academicLoading ? "Loading faculties..." : "Select faculty"}</option>
                  {activeFaculties.map((facultyOption) => (
                    <option key={facultyOption.id} value={facultyOption.id}>{facultyOption.name}</option>
                  ))}
                </select>
                {!academicLoading && activeFaculties.length === 0 && (
                  <small className="field-help">No active faculties yet. Ask an administrator to add one in Settings.</small>
                )}
              </label>
              <label className="field">
                <span>Department</span>
                <select
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                  required
                  disabled={saving || academicLoading || !facultyId || availableDepartments.length === 0}
                >
                  <option value="" disabled>{!facultyId ? "Select a faculty first" : "Select department"}</option>
                  {availableDepartments.map((departmentOption) => (
                    <option key={departmentOption.id} value={departmentOption.id}>{departmentOption.name}</option>
                  ))}
                </select>
                {facultyId && availableDepartments.length === 0 && (
                  <small className="field-help">No active departments exist under this faculty yet.</small>
                )}
              </label>
            </div>

            <div className="course-picker">
              <div className="course-picker-heading">
                <div>
                  <strong>Courses offered</strong>
                  <span>Select all active courses this student is enrolled in.</span>
                </div>
                <span className="selection-count">{selectedCourseIds.length} selected</span>
              </div>
              <label className="course-search-wrap">
                <Search size={15} />
                <input
                  value={courseSearch}
                  onChange={(event) => setCourseSearch(event.target.value)}
                  placeholder="Find a course"
                  aria-label="Search available courses"
                  disabled={saving}
                />
              </label>
              <div className="course-options">
                {filteredCourses.map((course) => (
                  <label key={course.id} className={selectedCourseIds.includes(course.id) ? "course-option checked" : "course-option"}>
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.includes(course.id)}
                      onChange={() => toggleCourse(course.id)}
                      disabled={saving}
                    />
                    <span className="custom-check">{selectedCourseIds.includes(course.id) && <Check size={13} />}</span>
                    <span>{course.name}</span>
                  </label>
                ))}
                {filteredCourses.length === 0 && (
                  <p className="course-list-empty">No active courses match this search.</p>
                )}
              </div>
            </div>

            <div className="face-registration-note">
              <div className="face-note-icon"><Camera size={20} /></div>
              <div>
                <strong>Face registration is a separate step</strong>
                <p>This form does not collect face images or biometric templates. Face registration will only be introduced after the privacy and consent safeguards are addressed.</p>
              </div>
              <span className="locked-pill"><Lock size={12} /> Not active</span>
            </div>

            <div className="form-footer">
              <p><ShieldCheck size={14} /> Student information is saved securely for authorised staff only.</p>
              <button type="submit" className="secondary-button" disabled={saving || activeCourseCount === 0 || activeFaculties.length === 0 || !facultyId || !departmentId || academicLoading}>
                {saving ? "Saving student..." : "Save student"}
                <ArrowRight size={16} />
              </button>
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

        {studentsLoading ? (
          <div className="student-directory-loading">Loading student records...</div>
        ) : filteredStudents.length > 0 ? (
          <>
            <div className="table-scroll">
              <table className="records-table">
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>REGISTRATION NUMBER</th>
                    <th>FACULTY / DEPARTMENT</th>
                    <th>COURSES</th>
                    <th>FACE PROFILE</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => {
                    const courseNames = (student.student_courses ?? [])
                      .map((enrolment) => enrolment.courses?.name)
                      .filter((name): name is string => Boolean(name));
                    return (
                      <tr key={student.id} className={!student.is_active ? "student-row-archived" : undefined}>
                        <td><strong className="student-name-cell">{student.full_name}</strong></td>
                        <td>{student.registration_number}</td>
                        <td><span className="student-academic-cell">{student.faculty}<small>{student.department}</small></span></td>
                        <td>{courseNames.length ? courseNames.join(", ") : "No course listed"}</td>
                        <td>
                          <button className="student-face-review-button" type="button" onClick={() => onOpenFaceReadiness(student)}>
                            <Camera size={12} /> Review readiness
                          </button>
                        </td>
                        <td><span className={student.is_active ? "student-status-pill active" : "student-status-pill archived"}>{student.is_active ? "Active" : "Archived"}</span></td>
                        <td>
                          <div className="student-row-actions">
                            <button className="student-edit-button" type="button" onClick={() => setEditingStudent(student)}>
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              className={student.is_active ? "student-archive-button" : "student-reactivate-button"}
                              type="button"
                              onClick={() => setStudentStatusTarget(student)}
                            >
                              {student.is_active ? "Archive" : "Reactivate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Users size={25} />}
            title={normalizedSearch ? "No matching student records" : "No students registered yet"}
            description={normalizedSearch ? "Try another name, registration number, faculty or department." : "Use Register student to create the first student record. Course enrolments will be saved with the student."}
          />
        )}
      </section>

      {editingStudent && (
        <EditStudentDialog
          student={editingStudent}
          courses={courses}
          faculties={faculties}
          departments={departments}
          onClose={() => setEditingStudent(null)}
          onSaved={loadStudents}
        />
      )}

      {studentStatusTarget && (
        <div className="confirmation-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !updatingStudentStatus) setStudentStatusTarget(null);
        }}>
          <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="student-status-title" aria-describedby="student-status-description">
            <div className="confirmation-icon">
              {studentStatusTarget.is_active ? <Lock size={22} /> : <Check size={22} />}
            </div>
            <h2 id="student-status-title">{studentStatusTarget.is_active ? "Archive this student?" : "Reactivate this student?"}</h2>
            <p id="student-status-description">
              {studentStatusTarget.is_active
                ? "This student will be marked inactive for future use. Their record and course history will be retained."
                : "This student will become active again and can be included in future academic workflows."}
            </p>
            <div className="confirmation-actions">
              <button className="course-admin-text-button" type="button" onClick={() => setStudentStatusTarget(null)} disabled={updatingStudentStatus}>Cancel</button>
              <button
                className={studentStatusTarget.is_active ? "settings-signout-button" : "primary-button"}
                type="button"
                onClick={() => void confirmStudentStatusChange()}
                disabled={updatingStudentStatus}
              >
                {updatingStudentStatus ? "Saving..." : studentStatusTarget.is_active ? "Archive student" : "Reactivate student"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function getLocalDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalTimeInputValue() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

type AttendanceSessionRow = {
  id: string;
  course_id: string;
  class_title: string;
  class_date: string;
  start_time: string;
  started_at: string;
  status: "active" | "ended";
  courses: { name: string } | null;
  snapshot_count: number;
};

function formatSessionDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function AttendancePage({ courses }: { courses: CourseRecord[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [classTitle, setClassTitle] = useState("");
  const [classDate, setClassDate] = useState(getLocalDateInputValue);
  const [startTime, setStartTime] = useState(getLocalTimeInputValue);
  const [sessions, setSessions] = useState<AttendanceSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [selectedSession, setSelectedSession] = useState<AttendanceSessionRow | null>(null);

  const loadSessions = async (showLoading = true): Promise<AttendanceSessionRow[]> => {
    if (showLoading) setSessionsLoading(true);
    const { data, error } = await supabase
      .from("attendance_sessions")
      .select("id, course_id, class_title, class_date, start_time, started_at, status, courses(name)")
      .order("started_at", { ascending: false })
      .limit(30);

    if (error) {
      setLoadError("Attendance sessions could not be loaded. Check your staff access and connection.");
      if (showLoading) setSessionsLoading(false);
      return [];
    }

    const sessionRows = (data ?? []) as unknown as Omit<AttendanceSessionRow, "snapshot_count">[];
    if (sessionRows.length === 0) {
      setSessions([]);
      setLoadError("");
      if (showLoading) setSessionsLoading(false);
      return [];
    }

    const sessionIds = sessionRows.map((session) => session.id);
    const { data: snapshotRows, error: snapshotError } = await supabase
      .from("session_enrolment_snapshots")
      .select("session_id")
      .in("session_id", sessionIds);

    if (snapshotError) {
      setLoadError("Session details loaded, but the saved enrolment snapshots could not be read.");
      const rows = sessionRows.map((session) => ({ ...session, snapshot_count: 0 }));
      setSessions(rows);
      if (showLoading) setSessionsLoading(false);
      return rows;
    }

    const snapshotCounts = new Map<string, number>();
    (snapshotRows ?? []).forEach((snapshot) => {
      snapshotCounts.set(
        snapshot.session_id,
        (snapshotCounts.get(snapshot.session_id) ?? 0) + 1,
      );
    });

    const rows = sessionRows.map((session) => ({
      ...session,
      snapshot_count: snapshotCounts.get(session.id) ?? 0,
    }));
    setSessions(rows);
    setLoadError("");
    if (showLoading) setSessionsLoading(false);
    return rows;
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const resetSessionForm = () => {
    setSelectedCourseId("");
    setClassTitle("");
    setClassDate(getLocalDateInputValue());
    setStartTime(getLocalTimeInputValue());
  };

  const handleStartSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!selectedCourseId) {
      setFormMessage("Select a course before starting the attendance session.");
      return;
    }

    setSaving(true);
    setFormMessage("");

    try {
      const { data, error } = await supabase.rpc("start_attendance_session", {
        p_course_id: selectedCourseId,
        p_class_title: classTitle.trim(),
        p_class_date: classDate,
        p_start_time: startTime,
      });

      if (error) {
        if (error.code === "42501") {
          setFormMessage("Your staff account is not authorised to start attendance sessions.");
        } else if (error.code === "22023") {
          setFormMessage(error.message || "Check the selected course and session details.");
        } else {
          setFormMessage("The attendance session could not be started. Check your connection and try again.");
        }
        return;
      }

      const sessionId = data as string;
      const refreshed = await loadSessions(false);
      const startedSession = refreshed.find((session) => session.id === sessionId);
      const snapshotCount = startedSession?.snapshot_count ?? 0;

      resetSessionForm();
      setFormOpen(false);
      setFormMessage(
        `Attendance session started successfully. ${snapshotCount} eligible student${snapshotCount === 1 ? "" : "s"} saved in the session snapshot.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const activeSessionCount = sessions.filter((session) => session.status === "active").length;

  if (selectedSession) {
    return (
      <SessionRosterPage
        session={selectedSession as SessionRosterSummary}
        onBack={() => setSelectedSession(null)}
      />
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CLASS MANAGEMENT</div>
          <h1>Attendance</h1>
          <p>Create class sessions, scan eligible students and review attendance.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => {
          setFormOpen((open) => !open);
          setFormMessage("");
        }}>
          {formOpen ? <X size={18} /> : <Plus size={18} />}
          {formOpen ? "Close form" : "Create attendance"}
        </button>
      </div>

      <section className="stats-grid" aria-label="Attendance overview">
        <StatCard icon={<CalendarDays size={19} />} label="Attendance sessions" value={String(sessions.length)} note="Sessions created" />
        <StatCard icon={<Users size={19} />} label="Active sessions" value={String(activeSessionCount)} note="Currently open classes" />
        <StatCard icon={<FileText size={19} />} label="Reports available" value="0" note="End-class reporting is next" />
      </section>

      {formMessage && (
        <div className="student-form-message" role="status">
          <Info size={16} />
          <span>{formMessage}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setFormMessage("")}><X size={15} /></button>
        </div>
      )}
      {loadError && (
        <div className="student-form-message" role="alert">
          <Info size={16} />
          <span>{loadError}</span>
        </div>
      )}

      {formOpen && (
        <section className="panel attendance-form-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">NEW CLASS SESSION</div>
              <h2>Create attendance</h2>
              <p>Set up the class before beginning attendance processing.</p>
            </div>
            <span className="step-tag">SESSION SETUP</span>
          </div>
          <form onSubmit={handleStartSession}>
            <div className="form-grid">
              <label className="field">
                <span>Course</span>
                <select
                  value={selectedCourseId}
                  onChange={(event) => setSelectedCourseId(event.target.value)}
                  required
                  disabled={saving || courses.length === 0}
                >
                  <option value="" disabled>Select course</option>
                  {courses.filter((course) => course.is_active).map((course) => (
                    <option value={course.id} key={course.id}>{course.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Class title</span>
                <input
                  type="text"
                  value={classTitle}
                  onChange={(event) => setClassTitle(event.target.value)}
                  placeholder="e.g. Week 1 Lecture"
                  minLength={2}
                  maxLength={160}
                  required
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>Class date</span>
                <input
                  type="date"
                  value={classDate}
                  onChange={(event) => setClassDate(event.target.value)}
                  required
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>Start time</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                  disabled={saving}
                />
              </label>
            </div>
            <div className="session-rule">
              <ShieldCheck size={19} />
              <p>When you start the session, CampusFace saves a fixed snapshot of every active student enrolled in the selected course. Later enrolment or student-record changes will not alter this class's eligibility list.</p>
            </div>
            <div className="form-footer">
              <p><Lock size={14} /> Only active lecturers and administrators can start sessions.</p>
              <button type="submit" className="secondary-button" disabled={saving || courses.filter((course) => course.is_active).length === 0}>
                {saving ? "Starting session..." : "Start attendance"}
                <ArrowRight size={16} />
              </button>
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
        {sessionsLoading ? (
          <div className="student-directory-loading">Loading attendance sessions...</div>
        ) : sessions.length > 0 ? (
          <div className="table-scroll">
            <table className="records-table attendance-table">
              <thead>
                <tr>
                  <th>CLASS</th>
                  <th>COURSE</th>
                  <th>DATE & TIME</th>
                  <th>STUDENTS SNAPSHOTTED</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td><strong className="student-name-cell">{session.class_title}</strong></td>
                    <td>{session.courses?.name ?? "Course unavailable"}</td>
                    <td>
                      <span className="student-academic-cell">
                        {formatSessionDate(session.class_date)}
                        <small>{session.start_time.slice(0, 5)}</small>
                      </span>
                    </td>
                    <td>{session.snapshot_count}</td>
                    <td>
                      <span className={session.status === "active" ? "student-status-pill active" : "student-status-pill archived"}>
                        {session.status === "active" ? "Active" : "Ended"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="session-view-roster-button"
                        type="button"
                        onClick={() => setSelectedSession(session)}
                      >
                        <Users size={13} />
                        View roster
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<ClipboardList size={25} />}
            title="No attendance sessions yet"
            description="Create a session to save its course, class details and fixed eligible-student snapshot."
          />
        )}
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

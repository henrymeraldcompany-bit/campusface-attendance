function App() {
  return (
    <main className="app-shell">
      <section className="welcome-card" aria-labelledby="app-title">
        <div className="brand-mark" aria-hidden="true">CF</div>
        <p className="eyebrow">LECTURER PORTAL</p>
        <h1 id="app-title">CampusFace Attendance</h1>
        <p className="intro">
          A secure attendance workspace for authorised lecturers and administrators.
        </p>
        <div className="status-note">
          <span className="status-dot" />
          Project foundation is ready
        </div>
        <p className="notice">
          Student access is not provided. Student records and biometric data must
          only be handled through authorised staff workflows after privacy and
          institutional approvals are in place.
        </p>
      </section>
    </main>
  );
}

export default App;

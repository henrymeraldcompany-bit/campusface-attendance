import { useState } from "react";
import type { FormEvent } from "react";
import {
  Eye,
  EyeOff,
  GraduationCap,
  LogIn,
  ShieldCheck,
} from "lucide-react";

type LoginScreenProps = {
  onSignIn: (email: string, password: string) => Promise<void>;
  message: string;
  onRequestPasswordReset: (email: string) => Promise<void>;
  recoveryMode: boolean;
  onUpdatePassword: (password: string) => Promise<void>;
};

export function LoginScreen({
  onSignIn,
  message,
  onRequestPasswordReset,
  recoveryMode,
  onUpdatePassword,
}: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password || submitting) return;

    setSubmitting(true);
    setFormMessage("");
    try {
      await onSignIn(email.trim(), password);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || submitting) return;

    setSubmitting(true);
    setFormMessage("");
    try {
      await onRequestPasswordReset(email.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 8 || submitting) return;

    if (newPassword !== confirmPassword) {
      setFormMessage("The passwords do not match. Please enter them again.");
      return;
    }

    setSubmitting(true);
    setFormMessage("");
    try {
      await onUpdatePassword(newPassword);
    } finally {
      setSubmitting(false);
    }
  };

  const heading = recoveryMode
    ? "Choose a new password"
    : forgotMode
      ? "Reset your password"
      : "Sign in to CampusFace";

  const description = recoveryMode
    ? "Create a new password for your CampusFace staff account."
    : forgotMode
      ? "Enter your staff email address. We will send a secure password-reset link."
      : "Use your authorised staff account to open the attendance workspace.";

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand-mark">
          <GraduationCap size={27} />
        </div>
        <p className="auth-eyebrow">LECTURER & ADMINISTRATOR PORTAL</p>
        <h1 id="auth-title">{heading}</h1>
        <p className="auth-description">{description}</p>

        {(message || formMessage) && (
          <div className="auth-message" role="alert">
            {formMessage || message}
          </div>
        )}

        {recoveryMode ? (
          <form className="auth-form" onSubmit={handleUpdatePassword}>
            <label className="auth-field">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={submitting}
              />
            </label>
            <label className="auth-field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={submitting}
              />
            </label>
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Saving password..." : "Set new password"}
            </button>
          </form>
        ) : forgotMode ? (
          <form className="auth-form" onSubmit={handleRecovery}>
            <label className="auth-field">
              <span>Staff email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                disabled={submitting}
              />
            </label>
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Sending email..." : "Send password reset email"}
            </button>
            <button
              className="auth-forgot-link"
              type="button"
              onClick={() => {
                setForgotMode(false);
                setFormMessage("");
              }}
              disabled={submitting}
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <>
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field">
                <span>Staff email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@university.edu"
                  autoComplete="username"
                  required
                  disabled={submitting}
                />
              </label>

              <div className="auth-field">
                <label htmlFor="staff-password">Password</label>
                <span className="auth-password-control">
                  <input
                    id="staff-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </div>

              <button className="auth-submit" type="submit" disabled={submitting}>
                <LogIn size={17} />
                <span>{submitting ? "Signing in..." : "Sign in securely"}</span>
              </button>
            </form>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => {
                setForgotMode(true);
                setFormMessage("");
              }}
            >
              Forgot password?
            </button>
          </>
        )}

        <div className="auth-security-note">
          <ShieldCheck size={18} />
          <p>
            Staff accounts are provisioned by a CampusFace administrator. There is
            no public sign-up, and students do not sign in.
          </p>
        </div>
      </section>
      <p className="auth-footer">CampusFace Attendance · Staff access only</p>
    </main>
  );
}

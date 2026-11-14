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

export function LoginScreen({ onSignIn, message, onRequestPasswordReset, recoveryMode, onUpdatePassword }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password || submitting) return;

    setSubmitting(true);
    try {
      await onSignIn(email, password);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecovery = async (event: FormEvent<HTMLFormElement>) => {\n    event.preventDefault();\n    if (!email.trim() || submitting) return;\n    setSubmitting(true);\n    try { await onRequestPasswordReset(email.trim()); } finally { setSubmitting(false); }\n  };\n\n  const handleUpdatePassword = async (event: FormEvent<HTMLFormElement>) => {\n    event.preventDefault();\n    if (newPassword.length < 8 || submitting) return;\n    setSubmitting(true);\n    try { await onUpdatePassword(newPassword); } finally { setSubmitting(false); }\n  };\n\n  return (\n    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand-mark">
          <GraduationCap size={27} />
        </div>
        <p className="auth-eyebrow">LECTURER & ADMINISTRATOR PORTAL</p>
        <h1 id="auth-title">Sign in to CampusFace</h1>
        <p className="auth-description">
          Use your authorised staff account to open the attendance workspace.
        </p>

        {message && (
          <div className="auth-message" role="alert">
            {message}
          </div>
        )}

        {recoveryMode ? (
          <form className="auth-form" onSubmit={handleUpdatePassword}>
            <label className="auth-field"><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required disabled={submitting} /></label>
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Saving..." : "Set new password"}</button>
          </form>
        ) : forgotMode ? (
          <form className="auth-form" onSubmit={handleRecovery}>
            <label className="auth-field"><span>Staff email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={submitting} /></label>
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Sending..." : "Send password reset email"}</button>
            <button className="auth-password-toggle" type="button" onClick={() => setForgotMode(false)}>Back to sign in</button>
          </form>
        ) : (
          <>
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field"><span>Staff email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@university.edu" autoComplete="username" required disabled={submitting} /></label>
              <label className="auth-field"><span>Password</span><span className="auth-password-control"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required disabled={submitting} /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
              <button className="auth-submit" type="submit" disabled={submitting}><LogIn size={17} /><span>{submitting ? "Signing in..." : "Sign in securely"}</span></button>
            </form>
            <button type="button" className="auth-forgot-link" onClick={() => setForgotMode(true)}>Forgot password?</button>
          </>
        )}

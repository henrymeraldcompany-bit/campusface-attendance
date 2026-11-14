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
};

export function LoginScreen({ onSignIn, message }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <main className="auth-screen">
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

          <label className="auth-field">
            <span>Password</span>
            <span className="auth-password-control">
              <input
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
          </label>

          <button className="auth-submit" type="submit" disabled={submitting}>
            <LogIn size={17} />
            <span>{submitting ? "Signing in..." : "Sign in securely"}</span>
          </button>
        </form>

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

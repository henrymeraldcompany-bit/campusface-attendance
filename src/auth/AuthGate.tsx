import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { LoginScreen } from "./LoginScreen";
import { supabase } from "../lib/supabase";

export type StaffProfile = {
  id: string;
  full_name: string;
  staff_role: "lecturer" | "administrator";
  is_active: boolean;
};

type AuthGateProps = {
  children: (
    profile: StaffProfile,
    onSignOut: () => Promise<void>,
  ) => ReactNode;
};

type AuthStatus =
  | "loading"
  | "checking"
  | "ready"
  | "signed-out"
  | "recovery"
  | "error";

const SESSION_RESTORE_TIMEOUT_MS = 8_000;
const STAFF_PROFILE_TIMEOUT_MS = 12_000;

function withTimeout<T>(
  request: PromiseLike<T>,
  timeoutMs: number,
  onTimeout: () => void,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: number | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      onTimeout();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(request), timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [message, setMessage] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);

  // Depend on the account identity, not the entire session object. Supabase
  // refreshes access tokens periodically; that should not send staff back
  // through the profile-verification loading screen.
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived = true;

      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setMessage("Choose a new password for your CampusFace account.");
        setStatus("recovery");
      }

      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !nextSession)) {
        setRecoveryMode(false);
        setProfile(null);
        setMessage("");
        setStatus("signed-out");
      }

      setSession(nextSession);
    });

    const restoreSession = async () => {
      try {
        const result = await withTimeout(
          supabase.auth.getSession(),
          SESSION_RESTORE_TIMEOUT_MS,
          () => undefined,
          "SESSION_RESTORE_TIMEOUT",
        );

        if (!mounted || authEventReceived) return;

        if (result.error) {
          setMessage("CampusFace could not restore your saved session. Check your connection and try signing in again.");
          setStatus("error");
          return;
        }

        if (!result.data.session) {
          setProfile(null);
          setStatus("signed-out");
          return;
        }

        setSession(result.data.session);
      } catch {
        if (!mounted || authEventReceived) return;
        setMessage("Restoring your saved session took too long. Check your connection, then try again.");
        setStatus("error");
      }
    };

    void restoreSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    if (recoveryMode) {
      setProfile(null);
      setStatus("recovery");
      return () => {
        active = false;
        controller.abort();
      };
    }

    if (!userId) {
      setProfile(null);
      setStatus("signed-out");
      return () => {
        active = false;
        controller.abort();
      };
    }

    setStatus("checking");
    setProfile(null);
    setMessage("");

    const verifyStaffAccess = async () => {
      try {
        // The Supabase Auth session already contains the authenticated user ID.
        // RLS validates the signed JWT at PostgREST, so a second getUser()
        // network call is unnecessary.
        const result = await withTimeout(
          supabase
            .from("staff_profiles")
            .select("id, full_name, staff_role, is_active")
            .eq("id", userId)
            .abortSignal(controller.signal)
            .maybeSingle(),
          STAFF_PROFILE_TIMEOUT_MS,
          () => controller.abort(),
          "STAFF_PROFILE_TIMEOUT",
        );

        if (!active) return;

        if (result.error) {
          setMessage("CampusFace could not reach the staff-permissions service. Your sign-in is preserved. Check your connection and retry.");
          setStatus("error");
          return;
        }

        const data = result.data;

        if (
          !data ||
          !data.is_active ||
          !["lecturer", "administrator"].includes(data.staff_role)
        ) {
          setMessage(
            "This account is not authorised for CampusFace. Only active lecturers and administrators can access the workspace. Contact the CampusFace administrator.",
          );
          setStatus("signed-out");
          await supabase.auth.signOut();
          return;
        }

        setProfile(data as StaffProfile);
        setMessage("");
        setStatus("ready");
      } catch (error) {
        if (!active) return;

        const timedOut =
          error instanceof Error &&
          (error.message === "STAFF_PROFILE_TIMEOUT" ||
            error.name === "AbortError");

        setMessage(
          timedOut
            ? "Staff verification took longer than 12 seconds. Your sign-in is preserved. Check your internet connection and try again."
            : "CampusFace could not complete staff verification. Your sign-in is preserved. Please retry.",
        );
        setStatus("error");
      }
    };

    void verifyStaffAccess();

    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, recoveryMode, verificationAttempt]);

  const handleRetryVerification = () => {
    setMessage("");
    setStatus("checking");
    setVerificationAttempt((attempt) => attempt + 1);
  };

  const handleSignIn = async (email: string, password: string) => {
    setMessage("");
    setStatus("checking");

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        15_000,
        () => undefined,
        "SIGN_IN_TIMEOUT",
      );

      if (error) {
        setStatus("signed-out");
        setMessage("Sign-in failed. Check your email and password, then try again.");
        return;
      }

      setSession(data.session);
    } catch {
      setStatus("signed-out");
      setMessage("Sign-in is taking too long. Check your internet connection and try again.");
    }
  };

  const handlePasswordReset = async (email: string) => {
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;

    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email, { redirectTo }),
        15_000,
        () => undefined,
        "PASSWORD_RESET_TIMEOUT",
      );

      if (error) {
        setMessage("We could not send the reset email. Please check your email address and the Supabase Auth email settings.");
        return;
      }

      setMessage("Password reset email sent. Open the link in your email on this device to choose a new password.");
    } catch {
      setMessage("The password-reset request took too long. Check your internet connection and try again.");
    }
  };

  const handleUpdatePassword = async (password: string) => {
    try {
      const { error } = await withTimeout(
        supabase.auth.updateUser({ password }),
        15_000,
        () => undefined,
        "PASSWORD_UPDATE_TIMEOUT",
      );

      if (error) {
        setMessage("The password could not be updated. Reopen the latest password-reset email and try again.");
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut();
      setRecoveryMode(false);
      setSession(null);
      setProfile(null);
      setStatus("signed-out");
      setMessage(
        signOutError
          ? "Your password was updated. Please reload this page, then sign in with your new password."
          : "Your password was updated successfully. Sign in with your new password.",
      );
    } catch {
      setMessage("Updating the password took too long. Check your connection and try again.");
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage("Sign-out did not complete. Please try again.");
      setStatus("error");
      return;
    }

    setSession(null);
    setProfile(null);
    setRecoveryMode(false);
    setMessage("");
    setStatus("signed-out");
  };

  if (status === "ready" && profile) {
    return <>{children(profile, handleSignOut)}</>;
  }

  if (status === "loading" || status === "checking") {
    return (
      <main className="auth-loading-screen" aria-live="polite">
        <div className="auth-loading-mark">
          <span className="auth-spinner" />
        </div>
        <strong>
          {status === "loading" ? "Opening CampusFace" : "Verifying staff access"}
        </strong>
        <p>
          {status === "loading"
            ? "Restoring your saved session."
            : "Checking your staff permissions securely."}
        </p>
      </main>
    );
  }

  if (status === "error" && session && !recoveryMode) {
    return (
      <main className="auth-loading-screen auth-verification-error" aria-live="polite">
        <div className="auth-verification-error-icon">
          <span>!</span>
        </div>
        <strong>Staff verification needs another try</strong>
        <p>{message}</p>
        <div className="auth-verification-actions">
          <button type="button" className="auth-submit" onClick={handleRetryVerification}>
            Try again
          </button>
          <button type="button" className="auth-secondary-action" onClick={() => void handleSignOut()}>
            Return to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <LoginScreen
      onSignIn={handleSignIn}
      message={message}
      onRequestPasswordReset={handlePasswordReset}
      recoveryMode={recoveryMode}
      onUpdatePassword={handleUpdatePassword}
    />
  );
}

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

type AuthStatus = "loading" | "checking" | "ready" | "signed-out" | "error";

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [message, setMessage] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived = true;
      if (event === "PASSWORD_RECOVERY") { setRecoveryMode(true); setMessage("Choose a new password for your CampusFace account."); }
      if (mounted) setSession(nextSession);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || authEventReceived) return;
      if (error) {
        setMessage("Your saved session could not be restored. Please sign in again.");
        setStatus("signed-out");
        return;
      }
      setSession(data.session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!session) {
      setProfile(null);
      setStatus("signed-out");
      return () => {
        active = false;
      };
    }

    setStatus("checking");
    setProfile(null);

    const verifyStaffAccess = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (userError || !user) {
        setMessage("Your session could not be verified. Please sign in again.");
        await supabase.auth.signOut();
        return;
      }

      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, full_name, staff_role, is_active")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setMessage("CampusFace could not verify your staff permissions. Check your connection and try again.");
        setStatus("error");
        return;
      }

      if (
        !data ||
        !data.is_active ||
        !["lecturer", "administrator"].includes(data.staff_role)
      ) {
        setMessage("This account is not authorised for CampusFace. Only active lecturers and administrators can access the workspace. Contact the CampusFace administrator.");
        await supabase.auth.signOut();
        return;
      }

      setProfile(data as StaffProfile);
      setMessage("");
      setStatus("ready");
    };

    void verifyStaffAccess();

    return () => {
      active = false;
    };
  }, [session]);

  const handleSignIn = async (email: string, password: string) => {
    setMessage("");
    setStatus("checking");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus("signed-out");
      setMessage("Sign-in failed. Check your email and password, then try again.");
      return;
    }

    setSession(data.session);
  };

  const handlePasswordReset = async (email: string) => {
    const redirectTo = `${window.location.origin}/campusface-attendance/`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) { setMessage("We could not send the reset email. Check the address and Supabase email settings."); return; }
    setMessage("Password reset email sent. Open the link in your email on this device.");
  };

  const handleUpdatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setMessage("Could not update the password. Please reopen the recovery email link and try again."); return; }
    setRecoveryMode(false);
    setMessage("Password updated. You can now sign in with your new password.");
    await supabase.auth.signOut();
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
        <strong>{status === "loading" ? "Opening CampusFace" : "Verifying staff access"}</strong>
        <p>Securely checking your account.</p>
      </main>
    );
  }

  return <LoginScreen onSignIn={handleSignIn} message={message} onRequestPasswordReset={handlePasswordReset} recoveryMode={recoveryMode} onUpdatePassword={handleUpdatePassword} />;
}

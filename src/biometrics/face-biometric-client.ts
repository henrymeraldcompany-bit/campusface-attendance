import { supabase, supabasePublishableKey, supabaseUrl } from "../lib/supabase";

const FACE_FUNCTION_TIMEOUT_MS = 45_000;

type FaceBiometricResponse = Record<string, any>;

/**
 * Calls the face Edge Function with the signed-in staff JWT and a bounded
 * network wait. This keeps server requests distinguishable from model-loading
 * failures and prevents the Capture button from spinning forever.
 */
export async function invokeFaceBiometric(
  body: Record<string, unknown>,
): Promise<FaceBiometricResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error("CampusFace could not read your sign-in session. Sign out and sign in again.");
  }

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("Your CampusFace session has expired. Sign in again, then retry face registration.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    FACE_FUNCTION_TIMEOUT_MS,
  );

  try {
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/face-biometric`, {
        method: "POST",
        headers: {
          "apikey": supabasePublishableKey,
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-client-info": "campusface-face-biometric/1.0",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        throw new Error("CampusFace did not receive a response from the secure server within 45 seconds. Check your connection and retry.");
      }
      if (reason instanceof TypeError) {
        throw new Error("CampusFace could not connect to the secure face service. Check your internet connection, then retry. No face photo or video was uploaded.");
      }
      throw reason;
    }

    const responseText = await response.text();
    let payload: FaceBiometricResponse;
    try {
      payload = responseText ? JSON.parse(responseText) as FaceBiometricResponse : {};
    } catch {
      throw new Error(`The secure face service returned an unreadable response (HTTP ${response.status}). Please retry.`);
    }

    if (!response.ok || payload.error) {
      if (response.status === 401) {
        throw new Error(payload.error || "Your staff sign-in has expired. Sign in again.");
      }
      throw new Error(payload.error || `Face registration failed (HTTP ${response.status}). Contact the CampusFace administrator if it continues.`);
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

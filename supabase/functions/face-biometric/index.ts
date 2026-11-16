import { createSupabaseContext } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://henrymeraldcompany-bit.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

type JsonObject = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODEL_ID = "opencv-sface-2021dec";
const VECTOR_SIZE = 128;

function response(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function textValue(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function vectorValue(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== VECTOR_SIZE) return null;
  if (value.some((item) => typeof item !== "number" || !Number.isFinite(item))) return null;
  const vector = value as number[];
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (norm < 0.98 || norm > 1.02) return null;
  return vector;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function getEncryptionKey() {
  const encoded = Deno.env.get("FACE_TEMPLATE_ENCRYPTION_KEY") ?? "";
  if (!encoded) throw new Error("FACE_TEMPLATE_ENCRYPTION_KEY is not configured.");
  const raw = decodeBase64(encoded);
  if (raw.length !== 32) throw new Error("FACE_TEMPLATE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptVector(vector: number[]) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(vector));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { encrypted_embedding: encodeBase64(new Uint8Array(ciphertext)), iv_base64: encodeBase64(iv) };
}

async function decryptVector(record: { encrypted_embedding: string; iv_base64: string }) {
  const key = await getEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(record.iv_base64) },
    key,
    decodeBase64(record.encrypted_embedding),
  );
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  return vectorValue(parsed);
}

function cosine(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

async function loadActor(admin: any, actorId: string) {
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id, full_name, staff_role, is_active")
    .eq("id", actorId)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;
  if (data.staff_role !== "lecturer" && data.staff_role !== "administrator") return null;
  return data;
}

async function loadGate(admin: any) {
  const { data, error } = await admin
    .from("biometric_processing_gate")
    .select("capture_enabled, institutional_approval_reference, dpia_reference, lawful_basis_reference, consent_process_reference, retention_policy_reference, security_review_reference, alternative_process_reference, approved_at, approved_by")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

function gateIsReady(gate: any) {
  return Boolean(
    gate?.capture_enabled &&
    gate?.institutional_approval_reference?.trim() &&
    gate?.dpia_reference?.trim() &&
    gate?.lawful_basis_reference?.trim() &&
    gate?.consent_process_reference?.trim() &&
    gate?.retention_policy_reference?.trim() &&
    gate?.security_review_reference?.trim() &&
    gate?.alternative_process_reference?.trim() &&
    gate?.approved_at &&
    gate?.approved_by
  );
}

async function verifySession(admin: any, actor: any, sessionId: string) {
  const { data: session, error } = await admin
    .from("attendance_sessions")
    .select("id, status, created_by")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session || session.status !== "active") return null;
  if (actor.staff_role !== "administrator" && session.created_by !== actor.id) return null;
  return session;
}

function cosineThreshold() {
  const raw = Deno.env.get("FACE_MATCH_MIN_COSINE") ?? "";
  const threshold = Number(raw);
  if (!raw || !Number.isFinite(threshold) || threshold < 0.363 || threshold > 0.95) {
    throw new Error("FACE_MATCH_MIN_COSINE must be explicitly configured between 0.363 and 0.95 after local validation.");
  }
  return threshold;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);
  if (Number(request.headers.get("content-length") ?? "0") > 16000) {
    return response({ error: "The request is too large." }, 413);
  }

  const { data: context, error: contextError } = await createSupabaseContext(request, { auth: "user" });
  if (contextError || !context?.userClaims?.id || !context.supabaseAdmin) {
    return response({ error: "A valid staff sign-in is required." }, 401);
  }

  const admin = context.supabaseAdmin;
  const actorId = String(context.userClaims.id);
  const actor = await loadActor(admin, actorId);
  if (!actor) return response({ error: "An active lecturer or administrator account is required." }, 403);

  let body: JsonObject;
  try {
    body = await request.json();
  } catch {
    return response({ error: "The request body must be valid JSON." }, 400);
  }

  const action = textValue(body.action, 32);

  if (action === "status") {
    const gate = await loadGate(admin);
    if (!gate) return response({ error: "Biometric readiness could not be verified. Processing remains locked." }, 503);
    let thresholdConfigured = false;
    try {
      cosineThreshold();
      thresholdConfigured = true;
    } catch {
      thresholdConfigured = false;
    }
    const encryptionConfigured = Boolean(Deno.env.get("FACE_TEMPLATE_ENCRYPTION_KEY"));
    const gateEnabled = gateIsReady(gate);
    const ready = gateEnabled && encryptionConfigured && thresholdConfigured;
    return response({
      capture_enabled: ready,
      gate_enabled: gateEnabled,
      ready,
      model_id: MODEL_ID,
      server_encryption_configured: encryptionConfigured,
      matching_threshold_configured: thresholdConfigured,
    });
  }

  const gate = await loadGate(admin);
  if (!gate || !gateIsReady(gate)) {
    return response({ error: "Face processing is locked. The server has not verified all institutional safeguards." }, 423);
  }

  if (action === "enroll") {
    if (actor.staff_role !== "administrator") {
      return response({ error: "Only an administrator may enrol a student face template." }, 403);
    }

    const studentId = textValue(body.student_id, 80);
    const reference = textValue(body.consent_reference, 240);
    const documentVersion = textValue(body.consent_document_version, 80);
    const isMinor = body.student_is_minor;
    const authority = textValue(body.consent_authority, 24);
    const vector = vectorValue(body.embedding);

    if (!UUID_PATTERN.test(studentId) || !vector || reference.length < 3 || !documentVersion) {
      return response({ error: "A valid student, consent reference, document version and face feature are required." }, 400);
    }
    if (typeof isMinor !== "boolean" ||
      (isMinor && authority !== "parent_guardian") ||
      (!isMinor && authority !== "student")) {
      return response({ error: "The consent authority does not match the student's recorded age category." }, 400);
    }

    let encrypted;
    try {
      encrypted = await encryptVector(vector);
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "Encryption is unavailable." }, 503);
    }

    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id, is_active")
      .eq("id", studentId)
      .maybeSingle();

    if (studentError || !student || !student.is_active) {
      return response({ error: "The active student record could not be verified." }, 404);
    }

    const { error: consentError } = await admin
      .from("biometric_student_consents")
      .upsert({
        student_id: studentId,
        consent_status: "granted",
        student_is_minor: isMinor,
        consent_authority: authority,
        consent_reference: reference,
        consent_document_version: documentVersion,
        recorded_by: actorId,
        recorded_at: new Date().toISOString(),
        withdrawn_at: null,
      });

    if (consentError) return response({ error: "The consent reference could not be saved. No face template was enrolled." }, 500);

    const { error: templateError } = await admin
      .from("face_templates")
      .upsert({
        student_id: studentId,
        encrypted_embedding: encrypted.encrypted_embedding,
        iv_base64: encrypted.iv_base64,
        key_version: 1,
        model_id: MODEL_ID,
        enrolled_by: actorId,
        enrolled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
      });

    if (templateError) {
      await admin.from("biometric_student_consents")
        .update({ consent_status: "withdrawn", withdrawn_at: new Date().toISOString() })
        .eq("student_id", studentId);
      return response({ error: "The encrypted template could not be saved. The consent state was rolled back." }, 500);
    }

    await admin.from("face_processing_audit").insert({
      actor_id: actorId, student_id: studentId, event_type: "template_enrolled",
    });

    return response({ success: true, message: "An encrypted face template was enrolled. The camera image was not uploaded or retained." }, 201);
  }

  if (action === "withdraw") {
    if (actor.staff_role !== "administrator") {
      return response({ error: "Only an administrator may withdraw or remove a face template." }, 403);
    }
    const studentId = textValue(body.student_id, 80);
    if (!UUID_PATTERN.test(studentId)) return response({ error: "A valid student must be selected." }, 400);

    const { error: consentError } = await admin.from("biometric_student_consents")
      .update({ consent_status: "withdrawn", withdrawn_at: new Date().toISOString() })
      .eq("student_id", studentId);
    if (consentError) return response({ error: "The consent status could not be updated." }, 500);

    const { error: templateError } = await admin.from("face_templates")
      .delete()
      .eq("student_id", studentId);
    if (templateError) return response({ error: "Consent is withdrawn, but template deletion must be retried by an administrator." }, 500);

    await admin.from("face_processing_audit").insert({
      actor_id: actorId, student_id: studentId, event_type: "template_withdrawn",
    });
    return response({ success: true, message: "Consent withdrawn and the stored template deleted." });
  }

  if (action === "match") {
    const sessionId = textValue(body.session_id, 80);
    const probe = vectorValue(body.embedding);
    if (!UUID_PATTERN.test(sessionId) || !probe) {
      return response({ error: "A valid active session and face feature are required." }, 400);
    }

    const session = await verifySession(admin, actor, sessionId);
    if (!session) return response({ error: "This active attendance session is unavailable to your account." }, 403);

    let threshold: number;
    try {
      await getEncryptionKey();
      threshold = cosineThreshold();
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "Recognition is not configured." }, 503);
    }

    const { data: roster, error: rosterError } = await admin
      .from("session_enrolment_snapshots")
      .select("student_id, student_full_name, registration_number")
      .eq("session_id", sessionId)
      .limit(500);

    if (rosterError || !roster?.length) return response({ error: "The saved session roster could not be loaded." }, 500);

    const studentIds = roster.map((row: any) => row.student_id);
    const [consents, templates] = await Promise.all([
      admin.from("biometric_student_consents")
        .select("student_id")
        .in("student_id", studentIds)
        .eq("consent_status", "granted")
        .is("withdrawn_at", null),
      admin.from("face_templates")
        .select("student_id, encrypted_embedding, iv_base64, is_active, model_id")
        .in("student_id", studentIds)
        .eq("is_active", true)
        .eq("model_id", MODEL_ID),
    ]);

    if (consents.error || templates.error) return response({ error: "The consented session templates could not be loaded." }, 500);
    const consentIds = new Set((consents.data ?? []).map((row: any) => row.student_id));
    const candidates: Array<{ row: any; score: number }> = [];

    for (const record of templates.data ?? []) {
      if (!consentIds.has(record.student_id)) continue;
      try {
        const saved = await decryptVector(record);
        if (!saved) continue;
        const row = roster.find((item: any) => item.student_id === record.student_id);
        if (row) candidates.push({ row, score: cosine(probe, saved) });
      } catch {
        return response({ error: "A protected face template could not be decrypted. Recognition was stopped." }, 503);
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    const best = candidates[0];
    const second = candidates[1];
    const ambiguityMargin = 0.035;

    if (!best || best.score < threshold ||
      (second && best.score - second.score < ambiguityMargin)) {
      await admin.from("face_processing_audit").insert({
        actor_id: actorId, session_id: sessionId, event_type: "match_candidate",
      });
      return response({
        outcome: "manual_review",
        message: "No sufficiently distinct candidate was found. Use manual identity verification.",
      });
    }

    await admin.from("face_match_tickets")
      .delete()
      .lt("expires_at", new Date().toISOString());

    const ticketExpiry = new Date(Date.now() + 60_000).toISOString();
    const { data: ticket, error: ticketError } = await admin
      .from("face_match_tickets")
      .insert({
        actor_id: actorId,
        session_id: sessionId,
        student_id: best.row.student_id,
        expires_at: ticketExpiry,
      })
      .select("id, expires_at")
      .single();

    if (ticketError || !ticket) return response({ error: "A short-lived confirmation could not be created." }, 500);

    await admin.from("face_processing_audit").insert({
      actor_id: actorId,
      student_id: best.row.student_id,
      session_id: sessionId,
      event_type: "match_candidate",
    });

    return response({
      outcome: "candidate",
      ticket_id: ticket.id,
      expires_at: ticket.expires_at,
      student: {
        id: best.row.student_id,
        full_name: best.row.student_full_name,
        registration_number: best.row.registration_number,
      },
      requires_lecturer_confirmation: true,
      message: "Candidate only. Check the student's identity in person before confirming attendance.",
    });
  }

  if (action === "confirm") {
    const ticketId = textValue(body.ticket_id, 80);
    if (!UUID_PATTERN.test(ticketId)) return response({ error: "A valid confirmation ticket is required." }, 400);

    const { data, error } = await admin.rpc("confirm_face_attendance", {
      p_ticket_id: ticketId,
      p_actor_id: actorId,
    });
    if (error) return response({ error: error.message || "Attendance could not be confirmed." }, 400);
    return response({ success: true, result: data });
  }

  return response({ error: "Unknown face-biometric action." }, 400);
});

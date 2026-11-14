import { createSupabaseContext } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://henrymeraldcompany-bit.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const { data: context, error: contextError } = await createSupabaseContext(
    request,
    { auth: "user" },
  );

  if (contextError || !context?.userClaims?.id || !context.supabaseAdmin) {
    return jsonResponse({ error: "A valid staff sign-in is required." }, 401);
  }

  const admin = context.supabaseAdmin;
  const actorId = context.userClaims.id as string;

  const { data: actor, error: actorError } = await admin
    .from("staff_profiles")
    .select("id, full_name, staff_role, is_active")
    .eq("id", actorId)
    .maybeSingle();

  if (actorError || !actor || !actor.is_active || actor.staff_role !== "administrator") {
    return jsonResponse({ error: "Only an active administrator can manage staff accounts." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "The request body must be valid JSON." }, 400);
  }

  const action = cleanText(body.action, 40);

  if (action === "list") {
    const { data, error } = await admin
      .from("staff_profiles")
      .select("id, email, full_name, staff_role, is_active, created_at")
      .order("full_name", { ascending: true })
      .limit(500);

    if (error) {
      return jsonResponse({ error: "Staff accounts could not be loaded." }, 500);
    }
    return jsonResponse({ staff: data ?? [] });
  }

  if (action === "invite") {
    const fullName = cleanText(body.full_name, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const role = cleanText(body.staff_role, 30) || "lecturer";

    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Enter a valid staff name and email address." }, 400);
    }
    if (role !== "lecturer" && role !== "administrator") {
      return jsonResponse({ error: "The selected staff role is not valid." }, 400);
    }

    if (body.course_ids !== undefined && !Array.isArray(body.course_ids)) {
      return jsonResponse({ error: "The lecturer course selection must be a list." }, 400);
    }

    const rawCourseIds = Array.isArray(body.course_ids) ? body.course_ids : [];
    if (rawCourseIds.length > 100) {
      return jsonResponse({ error: "A maximum of 100 courses can be assigned at once." }, 400);
    }

    const courseIds = rawCourseIds.map((value) =>
      typeof value === "string" ? value.trim() : ""
    );

    if (courseIds.some((id) => !UUID_PATTERN.test(id))) {
      return jsonResponse({ error: "One or more selected course identifiers are invalid." }, 400);
    }
    if (new Set(courseIds).size !== courseIds.length) {
      return jsonResponse({ error: "A course was selected more than once." }, 400);
    }

    if (role === "lecturer" && courseIds.length === 0) {
      return jsonResponse({ error: "Select at least one course before inviting a lecturer." }, 400);
    }
    if (role === "administrator" && courseIds.length > 0) {
      return jsonResponse({ error: "Course assignments are only selected when inviting a lecturer." }, 400);
    }

    const { data: existingProfile } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      return jsonResponse({ error: "A CampusFace staff profile already uses this email address." }, 409);
    }

    let courseNames: string[] = [];
    if (role === "lecturer") {
      const { data: selectedCourses, error: coursesError } = await admin
        .from("courses")
        .select("id, name, is_active")
        .in("id", courseIds);

      if (coursesError) {
        return jsonResponse({ error: "The selected courses could not be verified. No invitation was sent." }, 500);
      }

      const verifiedCourses = selectedCourses ?? [];
      if (
        verifiedCourses.length !== courseIds.length ||
        verifiedCourses.some((course) => !course.is_active)
      ) {
        return jsonResponse({ error: "One or more selected courses are unavailable. Refresh the course list and try again." }, 400);
      }

      const coursesById = new Map(verifiedCourses.map((course) => [course.id, course.name]));
      courseNames = courseIds.map((id) => coursesById.get(id) as string);
    }

    const siteUrl = "https://henrymeraldcompany-bit.github.io/campusface-attendance/";
    const courseNamesDisplay = courseNames.join(", ");

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: fullName,
          campusface_role_label: role === "lecturer" ? "Lecturer" : "Administrator",
          campusface_course_names: courseNamesDisplay,
          campusface_invitation_pending: true,
        },
        redirectTo: siteUrl,
      },
    );

    if (inviteError || !invited.user) {
      return jsonResponse({
        error: inviteError?.message ?? "The staff invitation could not be created.",
      }, 400);
    }

    const { error: profileError } = await admin
      .from("staff_profiles")
      .insert({
        id: invited.user.id,
        email,
        full_name: fullName,
        staff_role: role,
        is_active: true,
      });

    if (profileError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      return jsonResponse({
        error: "The invitation was rolled back because the staff profile could not be created.",
      }, 500);
    }

    if (role === "lecturer") {
      const assignmentRows = courseIds.map((courseId) => ({
        lecturer_id: invited.user.id,
        course_id: courseId,
        assigned_by: actorId,
      }));

      const { error: assignmentError } = await admin
        .from("lecturer_course_assignments")
        .insert(assignmentRows);

      if (assignmentError) {
        await admin.from("staff_profiles").delete().eq("id", invited.user.id);
        await admin.auth.admin.deleteUser(invited.user.id);
        return jsonResponse({
          error: "The invitation was cancelled because the course assignments could not be saved. No lecturer account was kept.",
        }, 500);
      }
    }

    await admin.from("staff_management_audit").insert({
      actor_id: actorId,
      target_staff_id: invited.user.id,
      action: "invited",
      details: {
        email,
        staff_role: role,
        assigned_course_names: courseNames,
        assigned_course_count: courseNames.length,
      },
    });

    const message = role === "lecturer"
      ? `Invitation sent to ${email}. ${fullName} has been assigned: ${courseNames.join(", ")}.`
      : `Administrator invitation sent to ${email}.`;

    return jsonResponse({
      success: true,
      message,
      staff_id: invited.user.id,
      assigned_course_names: courseNames,
    }, 201);
  }

  if (action === "update") {
    const targetId = cleanText(body.staff_id, 80);
    if (!UUID_PATTERN.test(targetId)) {
      return jsonResponse({ error: "A valid staff account must be selected." }, 400);
    }

    const { data: target, error: targetError } = await admin
      .from("staff_profiles")
      .select("id, email, full_name, staff_role, is_active")
      .eq("id", targetId)
      .maybeSingle();

    if (targetError || !target) {
      return jsonResponse({ error: "The selected staff profile could not be found." }, 404);
    }

    if (body.is_active !== undefined && typeof body.is_active !== "boolean") {
      return jsonResponse({ error: "The account activation setting must be true or false." }, 400);
    }

    const newRole = body.staff_role === undefined
      ? target.staff_role
      : cleanText(body.staff_role, 30);
    const newActive = body.is_active === undefined
      ? target.is_active
      : body.is_active;
    const newName = body.full_name === undefined
      ? target.full_name
      : cleanText(body.full_name, 120);

    if (newRole !== "lecturer" && newRole !== "administrator") {
      return jsonResponse({ error: "The selected staff role is not valid." }, 400);
    }
    if (newName.length < 2) {
      return jsonResponse({ error: "Staff names must contain at least two characters." }, 400);
    }

    if (target.id === actorId && (newRole !== "administrator" || !newActive)) {
      return jsonResponse({ error: "You cannot demote or deactivate your own signed-in administrator account. Another administrator must manage your access." }, 409);
    }

    const removesAdmin = target.staff_role === "administrator" &&
      target.is_active &&
      (newRole !== "administrator" || !newActive);

    if (removesAdmin) {
      const { count, error: countError } = await admin
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("staff_role", "administrator")
        .eq("is_active", true);

      if (countError) {
        return jsonResponse({ error: "The active administrator count could not be verified. No changes were made." }, 500);
      }
      if ((count ?? 0) <= 1) {
        return jsonResponse({ error: "The last active administrator cannot be demoted or deactivated. Promote another staff member first." }, 409);
      }
    }

    const changes: Record<string, unknown> = {
      full_name: newName,
      staff_role: newRole,
      is_active: newActive,
    };

    const { error: updateError } = await admin
      .from("staff_profiles")
      .update(changes)
      .eq("id", targetId);

    if (updateError) {
      return jsonResponse({ error: "The staff account could not be updated." }, 500);
    }

    let auditAction = "role_changed";
    if (target.is_active !== newActive) {
      auditAction = newActive ? "activated" : "deactivated";
    }

    await admin.from("staff_management_audit").insert({
      actor_id: actorId,
      target_staff_id: targetId,
      action: auditAction,
      details: {
        previous_role: target.staff_role,
        new_role: newRole,
        previous_active: target.is_active,
        new_active: newActive,
        full_name_changed: target.full_name !== newName,
      },
    });

    return jsonResponse({ success: true, message: "Staff account updated." });
  }

  return jsonResponse({ error: "Unknown staff-management action." }, 400);
});

export type AttendanceSummaryStudent = {
  student_id: string;
};

export type AttendanceSummary<T extends AttendanceSummaryStudent> = {
  presentStudents: T[];
  absentStudents: T[];
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
};

/**
 * Calculates attendance using only the students in the session's saved roster.
 * Any mark whose student ID is not in that immutable roster is ignored.
 */
export function calculateAttendanceSummary<T extends AttendanceSummaryStudent>(
  students: readonly T[],
  attendanceByStudent: Readonly<Record<string, unknown>>,
): AttendanceSummary<T> {
  const presentStudents = students.filter((student) =>
    Boolean(attendanceByStudent[student.student_id]),
  );
  const absentStudents = students.filter(
    (student) => !attendanceByStudent[student.student_id],
  );
  const presentCount = presentStudents.length;
  const absentCount = absentStudents.length;

  return {
    presentStudents,
    absentStudents,
    presentCount,
    absentCount,
    attendanceRate:
      students.length > 0 ? (presentCount / students.length) * 100 : 0,
  };
}

/**
 * Quotes CSV values and neutralises spreadsheet formula prefixes in text.
 */
export function csvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? "");
  const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Creates a portable, bounded filename segment for attendance reports. */
export function reportFileSlug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "class"
  );
}

import { describe, expect, it } from "vitest";
import {
  calculateAttendanceSummary,
  csvCell,
  reportFileSlug,
} from "../src/lib/attendance-report";

type Student = {
  student_id: string;
  student_full_name: string;
};

const roster: Student[] = [
  { student_id: "student-1", student_full_name: "Ada Okafor" },
  { student_id: "student-2", student_full_name: "Chidi Eze" },
  { student_id: "student-3", student_full_name: "Amaka Nwosu" },
];

describe("calculateAttendanceSummary", () => {
  it("returns zero attendance for an empty saved roster", () => {
    expect(calculateAttendanceSummary([], {})).toEqual({
      presentStudents: [],
      absentStudents: [],
      presentCount: 0,
      absentCount: 0,
      attendanceRate: 0,
    });
  });

  it("counts every roster member as absent when no marks exist", () => {
    const summary = calculateAttendanceSummary(roster, {});

    expect(summary.presentCount).toBe(0);
    expect(summary.absentCount).toBe(3);
    expect(summary.attendanceRate).toBe(0);
    expect(summary.absentStudents.map((student) => student.student_id)).toEqual([
      "student-1",
      "student-2",
      "student-3",
    ]);
  });

  it("calculates partial attendance from the saved roster", () => {
    const summary = calculateAttendanceSummary(roster, {
      "student-1": { marked_at: "2026-11-14T09:00:00Z" },
    });

    expect(summary.presentCount).toBe(1);
    expect(summary.absentCount).toBe(2);
    expect(summary.attendanceRate).toBeCloseTo(33.3333, 3);
    expect(summary.presentStudents[0].student_full_name).toBe("Ada Okafor");
  });

  it("returns 100 percent when every eligible student is present", () => {
    const summary = calculateAttendanceSummary(roster, {
      "student-1": true,
      "student-2": true,
      "student-3": true,
    });

    expect(summary.presentCount).toBe(3);
    expect(summary.absentCount).toBe(0);
    expect(summary.attendanceRate).toBe(100);
  });

  it("ignores attendance marks for students outside the saved roster", () => {
    const summary = calculateAttendanceSummary(roster, {
      "student-1": true,
      "not-in-this-session": true,
    });

    expect(summary.presentCount).toBe(1);
    expect(summary.absentCount).toBe(2);
    expect(summary.attendanceRate).toBeCloseTo(33.3333, 3);
  });
});

describe("CSV report helpers", () => {
  it("quotes commas, quotes, and line breaks correctly", () => {
    expect(csvCell('Okafor, "Henry"\nDepartment')).toBe(
      '"Okafor, ""Henry""\nDepartment"',
    );
  });

  it.each(["=SUM(A1:A2)", "+1+1", "-cmd", "@SUM(A1:A2)", "  =1+1"])(
    "neutralises spreadsheet formula prefix %s",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("handles nullish values as empty CSV cells", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it("normalises accents and punctuation in report filenames", () => {
    expect(reportFileSlug("Café / Week 1 — Physics")).toBe(
      "Cafe-Week-1-Physics",
    );
  });

  it("uses a safe fallback for titles without filename characters", () => {
    expect(reportFileSlug("★★★")).toBe("class");
  });

  it("limits report filename segments to 60 characters", () => {
    expect(reportFileSlug("A".repeat(80))).toHaveLength(60);
  });
});

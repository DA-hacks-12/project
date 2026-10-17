import type { TaskRow } from "./queries";

/** How many course colors there are (`--course-1` … in globals.css). */
export const COURSE_COLORS = 8;

/**
 * Each course's color number, 1 to COURSE_COLORS. The student's courses in
 * alphabetical order take the colors in turn, so a course has the same color
 * on every day and in every view.
 */
export function courseColors(
  tasks: Pick<TaskRow, "course">[],
): Map<string, number> {
  const courses = [
    ...new Set(tasks.flatMap((t) => (t.course ? [t.course] : []))),
  ].sort((a, b) => a.localeCompare(b));
  return new Map(courses.map((c, i) => [c, (i % COURSE_COLORS) + 1]));
}

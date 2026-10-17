import { describe, expect, it } from "vitest";
import { COURSE_COLORS, courseColors } from "./courses";

describe("courseColors", () => {
  it("gives each course its own color, alphabetically, whatever the task order", () => {
    const colors = courseColors([
      { course: "PSYC 1" },
      { course: "BIOL 10" },
      { course: null },
      { course: "PSYC 1" },
      { course: "MATH 1A" },
    ]);
    expect([...colors]).toEqual([
      ["BIOL 10", 1],
      ["MATH 1A", 2],
      ["PSYC 1", 3],
    ]);
  });

  it("goes round again past the last color", () => {
    const tasks = Array.from({ length: COURSE_COLORS + 1 }, (_, i) => ({
      course: `C${String(i).padStart(2, "0")}`,
    }));
    expect(courseColors(tasks).get("C08")).toBe(1);
  });
});

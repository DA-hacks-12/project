import { describe, expect, it } from "vitest";
import { sessionCovering } from "./lockdown";

const NOW = Date.parse("2026-10-16T21:10:00Z");
const TASKS = [
  { id: "ps4", title: "Problem Set 4", course: "PHYS 2A", done: false },
  { id: "essay", title: "Essay 2", course: "ENGL 1A", done: false },
  { id: "quiz", title: "Quiz 5", course: "BIOL 10", done: true },
];
const session = (
  task_id: string,
  start: string,
  minutes: number,
  done = false,
) => ({
  id: `${task_id}-${start}`,
  task_id,
  start,
  minutes,
  done,
});

describe("sessionCovering", () => {
  it("finds the session under way, with its end and the seconds left", () => {
    expect(
      sessionCovering([session("ps4", "2026-10-16T21:00:00Z", 30)], TASKS, NOW),
    ).toEqual({
      id: "ps4-2026-10-16T21:00:00Z",
      until: "2026-10-16T21:30:00.000Z",
      left: 1200,
      title: "Problem Set 4",
      course: "PHYS 2A",
    });
  });

  it("nothing before a session starts or once it's over", () => {
    const later = session("ps4", "2026-10-16T21:15:00Z", 30);
    const over = session("essay", "2026-10-16T20:10:00Z", 60); // ended at 21:10
    expect(sessionCovering([later, over], TASKS, NOW)).toBeNull();
  });

  it("skips a session or a task marked done", () => {
    expect(
      sessionCovering(
        [
          session("ps4", "2026-10-16T21:00:00Z", 30, true),
          session("quiz", "2026-10-16T21:00:00Z", 30),
        ],
        TASKS,
        NOW,
      ),
    ).toBeNull();
  });

  it("skips a session whose task is gone", () => {
    expect(
      sessionCovering(
        [session("gone", "2026-10-16T21:00:00Z", 30)],
        TASKS,
        NOW,
      ),
    ).toBeNull();
  });

  it("when two overlap, the one ending last", () => {
    const found = sessionCovering(
      [
        session("ps4", "2026-10-16T21:00:00Z", 30),
        session("essay", "2026-10-16T21:05:00Z", 45),
      ],
      TASKS,
      NOW,
    );
    expect(found?.title).toBe("Essay 2");
    expect(found?.left).toBe(2400);
  });
});

import { describe, expect, it } from "vitest";
import { preferenceRules, preferencesOf } from "./preferences";

describe("preferences", () => {
  it("keeps only real choices", () => {
    expect(
      preferencesOf({ sessions: "long", start: "sideways", mood: "happy" }),
    ).toEqual({ sessions: "long" });
    expect(preferencesOf(null)).toEqual({});
    expect(preferencesOf([])).toEqual({});
  });

  it("gives the planner one line per choice, none when unset", () => {
    expect(preferenceRules({})).toEqual([]);
    const rules = preferenceRules({ sessions: "short", start: "easy" });
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatch(/^Small chunks/);
    expect(rules[1]).toMatch(/^Easy first/);
  });
});

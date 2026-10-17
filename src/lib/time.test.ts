import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { clockRange } from "./time";

const at = (time: string) =>
  Temporal.ZonedDateTime.from(`2026-10-16T${time}[America/Los_Angeles]`);

describe("clockRange", () => {
  it("writes am/pm once when both ends share it", () => {
    expect(clockRange(at("17:20"), at("18:00"))).toBe("5:20–6:00pm");
  });

  it("writes both when the range crosses noon", () => {
    expect(clockRange(at("11:30"), at("12:15"))).toBe("11:30am–12:15pm");
  });
});

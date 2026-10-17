import { describe, expect, it } from "vitest";
import { check, plainHost } from "./site";

describe("check", () => {
  it("keeps one of the three words", () => {
    expect(check({ verdict: "distraction" })).toBe("distraction");
    expect(check({ verdict: "study" })).toBe("study");
  });

  it("treats anything else as unsure", () => {
    expect(check({ verdict: "block" })).toBe("unsure");
    expect(check(null)).toBe("unsure");
    expect(check({})).toBe("unsure");
  });
});

describe("plainHost", () => {
  it("lowercases and drops www.", () => {
    expect(plainHost("WWW.YouTube.com")).toBe("youtube.com");
    expect(plainHost("deanza.instructure.com")).toBe("deanza.instructure.com");
  });

  it("refuses anything that isn't a bare hostname", () => {
    expect(plainHost("https://youtube.com")).toBeNull();
    expect(plainHost("youtube.com/watch")).toBeNull();
    expect(plainHost("localhost")).toBeNull();
    expect(plainHost("a b.com")).toBeNull();
    expect(plainHost("x.com:3000")).toBeNull();
    expect(plainHost(42)).toBeNull();
  });
});

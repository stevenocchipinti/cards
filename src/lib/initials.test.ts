import { expect, test } from "vitest";
import { initials } from "./initials";

test("first letters of the first and last word", () => {
  expect(initials("Steve Occhipinti")).toBe("SO");
  expect(initials("  mary  jane  watson ")).toBe("MW");
});

test("first two letters of a single word", () => {
  expect(initials("hana")).toBe("HA");
  expect(initials("Q")).toBe("Q");
});

test("empty names get a placeholder", () => {
  expect(initials("   ")).toBe("?");
});

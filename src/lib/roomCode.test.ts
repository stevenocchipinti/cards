import { expect, test } from "vitest";
import { isCompleteCode, normalizeCode } from "./roomCode";

test("uppercases and drops characters outside the alphabet", () => {
  expect(normalizeCode("ab2c")).toBe("AB2C");
  expect(normalizeCode(" a-b 0o1l9 ")).toBe("AB9");
  expect(normalizeCode("abcdefg")).toBe("ABCD");
});

test("a complete code is 4 valid characters", () => {
  expect(isCompleteCode("AB2C")).toBe(true);
  expect(isCompleteCode("AB2")).toBe(false);
  expect(isCompleteCode("AB0C")).toBe(false);
});

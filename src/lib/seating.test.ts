import { expect, test } from "vitest";
import { dropIndex, moveItem } from "./seating";

test("moveItem moves forwards and backwards", () => {
  expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  expect(moveItem(["a", "b"], 1, 9)).toEqual(["a", "b"]);
});

test("dropIndex finds the slot from item midpoints", () => {
  const mids = [10, 30, 50, 70];
  expect(dropIndex(0, mids, 2)).toBe(0);
  expect(dropIndex(35, mids, 0)).toBe(1);
  expect(dropIndex(45, mids, 2)).toBe(2);
  expect(dropIndex(999, mids, 0)).toBe(3);
  expect(dropIndex(60, mids, 0)).toBe(2);
});

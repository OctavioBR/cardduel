import { describe, expect, it } from "vitest";
import { formatCopy } from "./index";

describe("copy formatting", () => {
  it("keeps player text literal, including replacement syntax and braces", () => {
    expect(formatCopy("{name}: {count}; {name}", { name: "$& {count}", count: 0 })).toBe(
      "$& {count}: 0; $& {count}",
    );
  });
});

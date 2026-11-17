import { describe, expect, it } from "vitest";
import { fitScale, STAGE_HEIGHT, STAGE_WIDTH } from "./Stage";

describe("fitScale", () => {
  it.each([
    [1520, 720, 1],
    [1920, 1080, 1920 / 1520],
    [3040, 1440, 2],
    [1280, 720, 1280 / 1520],
    [1600, 720, 1],
    [1000, 1000, 1000 / 1520],
  ])("fits %ix%i uniformly", (w, h, expected) => {
    const scale = fitScale(w, h);
    expect(scale).toBeCloseTo(expected);
    expect(STAGE_WIDTH * scale).toBeLessThanOrEqual(w + 1e-9);
    expect(STAGE_HEIGHT * scale).toBeLessThanOrEqual(h + 1e-9);
  });
});

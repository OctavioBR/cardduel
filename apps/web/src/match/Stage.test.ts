import { describe, expect, it } from "vitest";
import { MAX_ASPECT, MIN_ASPECT, STAGE_HEIGHT, STAGE_WIDTH, stageSize } from "./Stage";

describe("stageSize", () => {
  it.each([
    [1520, 720],
    [1920, 1080],
    [1440, 900],
    [1600, 1100],
    [2400, 1080],
    [3040, 1440],
    [1280, 720],
  ])("fills a %ix%i window exactly, inside the supported aspect ratios", (w, h) => {
    const { width, height, scale } = stageSize(w, h);
    expect(width * scale).toBeCloseTo(w, 0);
    expect(height * scale).toBeCloseTo(h, 0);
    expect(height).toBeGreaterThanOrEqual(STAGE_HEIGHT);
  });

  it("keeps the reference layout at 19:9", () => {
    const { width, height, scale } = stageSize(STAGE_WIDTH, STAGE_HEIGHT);
    expect(width).toBeCloseTo(STAGE_WIDTH);
    expect(height).toBeCloseTo(STAGE_HEIGHT);
    expect(scale).toBeCloseTo(1);
  });

  it.each([
    [3000, 900, MAX_ASPECT],
    [1000, 1000, MIN_ASPECT],
    [800, 1600, MIN_ASPECT],
  ])("letterboxes a %ix%i window at the nearest supported ratio", (w, h, aspect) => {
    const { width, height, scale } = stageSize(w, h);
    expect(width / height).toBeCloseTo(aspect, 2);
    expect(width * scale).toBeLessThanOrEqual(w + 1e-9);
    expect(height * scale).toBeLessThanOrEqual(h + 1e-9);
  });
});

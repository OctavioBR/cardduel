import { expect, type Page, test } from "@playwright/test";
import { actionCount, settled } from "./board";

/** Keyframe properties of every animation currently running on the page. */
async function runningProperties(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .flatMap((a) =>
        ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).flatMap((k) => Object.keys(k)),
      )
      .filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)),
  );
}

async function playWarDrum(page: Page) {
  await page.getByRole("button", { name: "War Drum" }).click();
  await page.getByRole("button", { name: /Play to the Horn slot of Your Close Row/ }).click();
}

test("playing a card animates, then the board matches the view exactly", async ({ page }) => {
  await page.goto("/dev/local?scenario=horn");
  const n = await actionCount(page);
  await playWarDrum(page);
  await expect(page.getByTestId("board")).toHaveAttribute("data-animating", "true");
  await settled(page);
  expect(await actionCount(page)).toBe(n + 1);
  expect(await page.locator(".anim-layer > *").count()).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(
    page.getByTestId("row-you-close").locator(".cd-strength.cd-raised").first(),
  ).toBeVisible();
});

test("Scorch animates the destroyed cards leaving", async ({ page }) => {
  await page.goto("/dev/local?scenario=scorch");
  await page.getByRole("button", { name: "Wildfire" }).click();
  await page.getByRole("button", { name: /Play Wildfire on the battlefield/ }).click();
  await expect(page.locator(".anim-clone.destroyed").first()).toBeAttached();
  await settled(page);
  expect(await page.locator(".anim-clone").count()).toBe(0);
});

test("a Round end shows its result", async ({ page }) => {
  await page.goto("/dev/local?scenario=horn");
  await expect(page.getByTestId("board")).toBeVisible();
  await page.keyboard.press("p");
  await page.keyboard.press("p");
  await settled(page);
  await page.keyboard.press("s");
  await page.keyboard.press("p");
  await page.keyboard.press("p");
  await expect(page.locator(".anim-round")).toContainText("Round 1");
  await settled(page);
});

test("a click anywhere skips to the final state", async ({ page }) => {
  await page.goto("/dev/local?scenario=horn");
  await playWarDrum(page);
  await expect(page.getByTestId("board")).toHaveAttribute("data-animating", "true");
  await page.getByTestId("board").click({ position: { x: 640, y: 300 } });
  await expect(page.getByTestId("board")).not.toHaveAttribute("data-animating", "true");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("with reduced motion, cards only fade", async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.goto("/dev/local?scenario=horn");
  await playWarDrum(page);
  await expect(page.getByTestId("board")).toHaveAttribute("data-animating", "true");
  const props = await runningProperties(page);
  expect(props.length).toBeGreaterThan(0);
  expect(new Set(props)).toEqual(new Set(["opacity"]));
  await context.close();
});

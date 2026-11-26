import { expect, test } from "@playwright/test";
import { actionCount } from "./board";

test("desktop: hovering a battlefield card opens Card Detail after a short delay", async ({
  page,
}) => {
  await page.goto("/dev/local?scenario=horn");
  const token = page.getByTestId("row-you-close").locator(".cd-card").first();
  await token.hover();
  const detail = page.getByTestId("card-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Horned Ravager");
  await page.mouse.move(5, 5);
  await expect(detail).toBeHidden();
});

test("keyboard: focus a hand card and press I; Esc closes", async ({ page }) => {
  await page.goto("/dev/local?scenario=horn");
  await expect(page.getByTestId("board")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("i");
  const detail = page.getByTestId("card-detail");
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
});

test("keyboard Card Detail keeps a Unit copy's illustration from Redraw", async ({ page }) => {
  await page.goto("/dev/local?deck=elves&seed=1");
  const card = page
    .getByTestId("redraw")
    .getByRole("button")
    .filter({
      has: page.locator("[data-art-index]"),
    })
    .first();
  await card.focus();
  const image = await card.locator("img").getAttribute("src");
  expect(image).toBeTruthy();
  await page.keyboard.press("i");
  await expect(page.getByTestId("card-detail").locator("img")).toHaveAttribute(
    "src",
    image as string,
  );
});

test("Discard Pile overlay cards open Card Detail too", async ({ page }) => {
  await page.goto("/dev/local?scenario=medic");
  await page.getByRole("button", { name: /Your Discard Pile/ }).click();
  await page
    .getByRole("dialog", { name: /Your Discard Pile/ })
    .locator(".cd-card")
    .first()
    .hover();
  await expect(page.getByTestId("card-detail")).toBeVisible();
});

test("touch: a long-press opens Card Detail without starting a play or a drag", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.goto("/dev/local?scenario=horn");
  const card = page.getByRole("button", { name: "War Drum" });
  const box = await card.boundingBox();
  if (!box) throw new Error("no box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  const n = await actionCount(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(800);
  await expect(page.getByTestId("card-detail")).toBeVisible();
  // A small wobble while lifting must not turn into a drag.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 20, y: y - 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByTestId("card-detail")).toContainText("War Drum");
  await expect(page.getByTestId("drag-ghost")).toHaveCount(0);
  await expect(card).toHaveAttribute("aria-pressed", "false");
  expect(await actionCount(page)).toBe(n);
  await context.close();
});

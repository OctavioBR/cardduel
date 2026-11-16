import { expect, type Locator, type Page, test } from "@playwright/test";
import { actionCount } from "./board";

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The Horn slot that appears once War Drum is being dragged. */
const closeSlot = (page: Page) =>
  page.getByRole("button", { name: /Play to the Horn slot of Your Close Row/ });

test("mouse: drag War Drum onto a Horn slot previews it, and releasing plays it", async ({
  page,
}) => {
  await page.goto("/dev/local?scenario=horn");
  const close = page.getByTestId("row-you-close");
  const score = Number(await close.locator(".row-score").textContent());
  const from = await center(page.getByRole("button", { name: "War Drum" }));
  const n = await actionCount(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y - 20, { steps: 4 });
  await expect(page.getByTestId("drag-ghost")).toBeVisible();
  const to = await center(closeSlot(page));
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(page.getByTestId("row-delta-you-close")).toHaveText(`+${score}`);
  await page.mouse.up();
  await expect.poll(() => actionCount(page)).toBeGreaterThan(n);
  await expect(close.locator(".row-score")).toHaveText(String(score * 2));
  await expect(page.getByTestId("drag-ghost")).toHaveCount(0);
});

test("mouse: releasing anywhere else cancels, and the card returns to the hand", async ({
  page,
}) => {
  await page.goto("/dev/local?scenario=horn");
  const card = page.getByRole("button", { name: "War Drum" });
  const from = await center(card);
  const n = await actionCount(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 300, from.y - 30, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("drag-ghost")).toHaveCount(0);
  expect(await actionCount(page)).toBe(n);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("aria-pressed", "false");
});

test("touch: dragging a card with a finger plays it", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.goto("/dev/local?scenario=horn");
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  const close = page.getByTestId("row-you-close");
  const score = Number(await close.locator(".row-score").textContent());
  const from = await center(page.getByRole("button", { name: "War Drum" }));
  const n = await actionCount(page);
  await touch("touchStart", from.x, from.y);
  for (let i = 1; i <= 5; i++) await touch("touchMove", from.x + i * 6, from.y - i * 6);
  await expect(page.getByTestId("drag-ghost")).toBeVisible();
  const to = await center(closeSlot(page));
  for (let i = 1; i <= 10; i++) {
    await touch(
      "touchMove",
      from.x + ((to.x - from.x) * i) / 10,
      from.y + ((to.y - from.y) * i) / 10,
    );
  }
  await touch("touchEnd", to.x, to.y);
  await expect.poll(() => actionCount(page)).toBeGreaterThan(n);
  await expect(close.locator(".row-score")).toHaveText(String(score * 2));
  await context.close();
});

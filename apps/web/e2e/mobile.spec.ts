import { expect, type Locator, test } from "@playwright/test";
import { actionCount, isMyTurn, keepForRound, matchOver, round, settled } from "./board";

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Missing touch target");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("landscape phone completes a Local Room Match using touch", async ({ page }) => {
  await page.goto("/dev/local?seed=42");
  await expect(page.getByTestId("rotate-notice")).toBeHidden();
  const seats = page.getByTestId("seat-toggle").getByRole("radio");
  for (const seat of [0, 1]) {
    await seats.nth(seat).tap();
    await page.getByRole("button", { name: "Keep hand" }).tap();
  }
  for (let i = 0; i < 80 && !(await matchOver(page)); i++) {
    await settled(page);
    if (!(await isMyTurn(page))) {
      await seats.nth((await seats.nth(0).isChecked()) ? 1 : 0).tap();
    }
    const before = await actionCount(page);
    const cards = page.locator('[data-testid="hand-card"]:enabled');
    if ((await cards.count()) > keepForRound(await round(page))) {
      await cards.first().tap();
      await page.locator("button.board-row.target").first().tap();
    } else {
      await page.getByRole("button", { name: "Pass" }).tap();
      const confirm = page.getByRole("button", { name: "Confirm Pass" });
      if (await confirm.isVisible()) await confirm.tap();
    }
    await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
  }
  await expect(page.getByTestId("result")).toHaveText(/You won the Match|You lost the Match|Draw/);
});

test("long-press and drag work on the scaled phone stage", async ({ page, context }) => {
  await page.goto("/dev/local?scenario=horn");
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  const card = page.getByRole("button", { name: "War Drum" });
  const from = await center(card);
  const before = await actionCount(page);
  await touch("touchStart", from.x, from.y);
  await expect(page.getByTestId("card-detail")).toBeVisible();
  await touch("touchEnd");
  await expect(card).toHaveAttribute("aria-pressed", "false");
  expect(await actionCount(page)).toBe(before);
  await page.waitForTimeout(450); // Let the long-press's synthetic-click guard expire.
  await page.getByTestId("card-detail").getByRole("button", { name: "Close" }).tap();
  const score = Number(await page.getByTestId("row-you-close").locator(".row-score").textContent());
  await touch("touchStart", from.x, from.y);
  await touch("touchMove", from.x + 15, from.y - 15);
  await expect(page.getByTestId("drag-ghost")).toBeVisible();
  const to = await center(
    page.getByRole("button", { name: /Play to the Horn slot of Your Close Row/ }),
  );
  await touch("touchMove", to.x, to.y);
  await touch("touchEnd");
  await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
  await expect(page.getByTestId("row-you-close").locator(".row-score")).toHaveText(
    String(score * 2),
  );
});

test("portrait notice is limited to the Match screen and clears on rotation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("rotate-notice")).toHaveCount(0);
  await page.goto("/dev/local?seed=42");
  await expect(page.getByTestId("rotate-notice")).toBeVisible();
  await expect(page.getByTestId("stage")).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId("rotate-notice")).toBeHidden();
  await expect(page.getByTestId("stage")).toBeVisible();
});

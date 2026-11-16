import { expect, type Page, test } from "@playwright/test";
import { actionCount } from "./board";

async function unitsOnBoard(page: Page): Promise<string[]> {
  return page
    .locator(".board-row .unit[data-uid]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-uid") ?? ""));
}

test("Scorch: the preview tints exactly the cards that are then destroyed", async ({ page }) => {
  await page.goto("/dev/local?scenario=scorch");
  await page.getByRole("button", { name: "Wildfire" }).click();
  // A single target (the battlefield): the preview shows at once.
  await expect(
    page.getByRole("button", { name: "Play Wildfire on the battlefield" }),
  ).toBeVisible();
  const doomed = await page
    .locator(".unit[data-doomed]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-uid")));
  expect(doomed.length).toBeGreaterThan(0);
  const before = await unitsOnBoard(page);
  const n = await actionCount(page);
  await page.getByRole("button", { name: "Play Wildfire on the battlefield" }).click();
  await expect.poll(() => actionCount(page)).toBeGreaterThan(n);
  const after = await unitsOnBoard(page);
  expect(before.filter((uid) => !after.includes(uid)).sort()).toEqual([...doomed].sort());
});

test("Horn: hovering a Horn slot previews the doubled Score, and playing gives that Score", async ({
  page,
}) => {
  await page.goto("/dev/local?scenario=horn");
  const close = page.getByTestId("row-you-close");
  const score = Number(await close.locator(".row-score").textContent());
  await page.getByRole("button", { name: "War Drum" }).click();
  const slot = page.getByRole("button", { name: /Play to the Horn slot of Your Close Row/ });
  await slot.hover();
  await expect(page.getByTestId("row-delta-you-close")).toHaveText(`+${score}`);
  const total = Number(
    await page
      .getByTestId("score-you")
      .locator(":scope")
      .evaluate((e) => e.firstChild?.textContent),
  );
  await expect(page.getByTestId("total-delta-you")).toHaveText(`+${score}`);
  await slot.click();
  await expect(close.locator(".row-score")).toHaveText(String(score * 2));
  await expect(page.getByTestId("score-you")).toContainText(String(total + score));
});

test("touch: the first tap on one of several targets previews, the second plays", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.goto("/dev/local?scenario=horn");
  await page.getByRole("button", { name: "War Drum" }).tap();
  const slot = page.getByRole("button", { name: /Play to the Horn slot of Your Siege Row/ });
  const n = await actionCount(page);
  await slot.tap();
  await expect(page.getByTestId("row-delta-you-siege")).toBeVisible();
  expect(await actionCount(page)).toBe(n);
  await slot.tap();
  await expect.poll(() => actionCount(page)).toBeGreaterThan(n);
  await context.close();
});

test("Pass takes a confirmation while the hand is not empty", async ({ page }) => {
  await page.goto("/dev/local?scenario=horn");
  const n = await actionCount(page);
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByRole("button", { name: "Confirm Pass" })).toBeVisible();
  expect(await actionCount(page)).toBe(n);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Pass" })).toBeVisible();
  await page.keyboard.press("p");
  await page.keyboard.press("p");
  await expect.poll(() => actionCount(page)).toBeGreaterThan(n);
});

test("a whole Match can be played with the keyboard only", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/dev/local?seed=42");
  const turn = page.getByTestId("turn");
  await expect(page.getByTestId("board")).toBeVisible();
  for (let i = 0; i < 200 && !(await page.getByTestId("result").isVisible()); i++) {
    await expect(page.getByTestId("board")).not.toHaveAttribute("data-animating", "true");
    // Checked again on the next pass if it renders a moment late.
    if (await page.getByTestId("round-result").isVisible()) {
      await page.keyboard.press("Enter");
      continue;
    }
    const n = await actionCount(page);
    const text = await turn.textContent();
    if (text === "Redraw") {
      if (await page.getByRole("button", { name: "Keep hand" }).isVisible())
        await page.keyboard.press("Enter");
      else await page.keyboard.press("s");
    } else if (text !== "Your Turn") {
      await page.keyboard.press("s");
      continue;
    } else {
      const round = Number(
        ((await page.locator(".round-info").textContent()) ?? "").match(/Round (\d+)/)?.[1] ?? 1,
      );
      const hand = await page.locator('[data-testid="hand-card"]:enabled').count();
      if (hand > 10 - 2 * round) {
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
      } else {
        await page.keyboard.press("p");
        await page.keyboard.press("p");
      }
    }
    if (
      text !== "Redraw" ||
      (await page.getByRole("button", { name: "Keep hand" }).count()) === 0
    ) {
      await expect.poll(() => actionCount(page)).toBeGreaterThanOrEqual(n);
    }
  }
  await expect(page.getByTestId("result")).toBeVisible();
});

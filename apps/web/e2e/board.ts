import { expect, type Page } from "@playwright/test";

export async function actionCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("board").getAttribute("data-action-count"));
}

export async function isMyTurn(page: Page): Promise<boolean> {
  return (await page.getByTestId("turn").textContent()) === "Your Turn";
}

export async function matchOver(page: Page): Promise<boolean> {
  return page.getByTestId("result").isVisible();
}

/**
 * Takes one Turn on a page whose Turn it is: plays the first playable card while the hand is
 * fuller than `keep`, otherwise Passes. Waits for the next view.
 */
export async function takeTurn(page: Page, keep: number): Promise<void> {
  const before = await actionCount(page);
  const cards = page.locator('[data-testid="hand-card"]:enabled');
  if ((await cards.count()) > keep) {
    await cards.first().click();
    await page.locator("button.board-row.target").first().click();
  } else {
    await page.getByRole("button", { name: "Pass" }).click();
  }
  await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
}

/** How many cards to keep each Round: play a few, then Pass, so Matches end quickly. */
export function keepForRound(round: number): number {
  return 10 - 2 * round;
}

export async function round(page: Page): Promise<number> {
  const text = (await page.locator(".round-info").textContent()) ?? "";
  return Number(text.match(/Round (\d+)/)?.[1] ?? 1);
}

/** Keeps the opening hand if this page still has to Redraw. */
export async function keepHand(page: Page): Promise<void> {
  const keep = page.getByRole("button", { name: "Keep hand" });
  if (!(await keep.isVisible())) return;
  const before = await actionCount(page);
  await keep.click();
  await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
}

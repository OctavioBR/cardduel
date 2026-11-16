import { expect, test } from "@playwright/test";
import { actionCount, settled } from "./board";

test("a full Local Room Match passes through every overlay", async ({ page }) => {
  await page.goto("/dev/local?seed=42");
  const radios = page.getByTestId("seat-toggle").getByRole("radio");

  // Reveal with the coin flip, then Redraw: return one card, confirm, wait for the opponent.
  await expect(page.getByTestId("reveal")).toBeVisible();
  await expect(page.getByTestId("coin-flip")).toContainText("Coin flip");
  await radios.nth(0).check();
  const n = await actionCount(page);
  const opening = page.getByRole("dialog", { name: "Match start" });
  await opening
    .getByRole("button", { name: /^Return / })
    .first()
    .click();
  await expect.poll(() => actionCount(page)).toBe(n + 1);
  await expect(page.getByTestId("redraw")).toContainText("1/2 returned");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("redraw-wait")).toContainText("Waiting for your opponent");
  await radios.nth(1).check();
  await page.getByRole("button", { name: "Keep hand" }).click();
  await expect(page.getByTestId("reveal")).toBeHidden();

  // Round 1: the Seat to move Passes; the other sees "opponent Passed", then also Passes.
  await settled(page);
  if ((await page.getByTestId("turn").textContent()) !== "Your Turn")
    await page.keyboard.press("s");
  await page.getByRole("button", { name: "Pass" }).click();
  await page.getByRole("button", { name: "Confirm Pass" }).click();
  await settled(page);
  await page.keyboard.press("s");
  await expect(page.getByTestId("opponent-passed")).toBeVisible();
  const card = page.locator('[data-testid="hand-card"]:enabled').first();
  await card.click();
  await page.locator("button.board-row.target").first().click();
  await expect(page.getByTestId("board")).not.toHaveAttribute("data-animating", "true");
  await page.getByRole("button", { name: "Pass" }).click();
  await page.getByRole("button", { name: "Confirm Pass" }).click();

  // Round result: Scores and Gems lost.
  const result = page.getByTestId("round-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("Gems lost");
  await expect(page.getByRole("dialog", { name: /Round 1: you win/ })).toBeVisible();
  await result.getByRole("button", { name: "Continue" }).click();
  await expect(result).toBeHidden();

  // Forfeit from the menu, confirmed on the page.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Forfeit" }).click();
  const confirm = page.getByRole("dialog", { name: "Forfeit this Match?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Forfeit" }).click();

  // Match end: loss, with Rematch and Leave.
  await expect(page.getByTestId("result")).toHaveText("You lost the Match");
  await expect(page.getByText("You Forfeited.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rematch" })).toBeVisible();
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/$/);
});

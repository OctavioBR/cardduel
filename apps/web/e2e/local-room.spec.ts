import { expect, test } from "@playwright/test";
import { isMyTurn, keepForRound, keepHand, matchOver, round, takeTurn } from "./board";

test("a Local Room Match with a fixed seed plays to Match end", async ({ page }) => {
  await page.goto("/dev/local?seed=42");
  await expect(page.getByTestId("board")).toBeVisible();
  const radios = page.getByTestId("seat-toggle").getByRole("radio");
  // The Local Room controls both Seats: keep both opening hands.
  for (const seat of [0, 1]) {
    await radios.nth(seat).check();
    await keepHand(page);
  }
  for (let i = 0; i < 80 && !(await matchOver(page)); i++) {
    if (!(await isMyTurn(page))) {
      // Switch to the other Seat: the Local Room controls both.
      const checked = (await radios.nth(0).isChecked()) ? 1 : 0;
      await radios.nth(checked).check();
      await expect(page.getByTestId("turn")).toHaveText("Your Turn");
    }
    await takeTurn(page, keepForRound(await round(page)));
  }
  await expect(page.getByTestId("result")).toHaveText(/You won the Match|You lost the Match|Draw/);
});

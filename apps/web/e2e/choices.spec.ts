import { expect, type Page, test } from "@playwright/test";
import { actionCount } from "./board";

const LEADER_KINDS = [
  "playWeatherFromDeck",
  "clearWeather",
  "hornRow",
  "scorchRow",
  "returnFromDiscard",
  "drawChosenFromDeck",
  "lookAtOpponentHand",
];

async function step(page: Page, act: () => Promise<void>) {
  const n = await actionCount(page);
  await act();
  await expect.poll(() => actionCount(page)).toBeGreaterThan(n);
}

test("a Medic chain: a Medic Plays a Medic, which Plays a Unit", async ({ page }) => {
  await page.goto("/dev/local?scenario=medic");
  await page.getByRole("button", { name: "Brood Tender" }).click();
  await step(page, () => page.getByRole("button", { name: /Play to Your Siege Row/ }).click());

  const choice = page.getByRole("dialog", { name: /Medic: choose a Unit/ });
  await expect(choice).toBeVisible();
  // A Pending Choice cannot be dismissed.
  await expect(choice.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(choice).toBeVisible();
  await expect(choice.getByTestId("preview-summary").first()).toContainText("You");
  await step(page, () => choice.getByRole("button", { name: /Choose Brood Tender/ }).click());

  await expect(page.getByRole("dialog", { name: /Medic: choose a Unit/ })).toBeVisible();
  await step(page, () => page.getByRole("button", { name: /Choose Thornback Crawler/ }).click());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("row-you-siege").locator(".unit")).toHaveCount(2);
  await expect(page.getByTestId("row-you-close")).toContainText("8");
});

for (const kind of LEADER_KINDS) {
  test(`Leader ability: ${kind}`, async ({ page }) => {
    await page.goto(`/dev/local?scenario=leader-${kind}`);
    await page.getByTestId("your-leader").click();
    const dialog = page.getByRole("dialog", { name: /Leader:/ });
    await expect(dialog).toBeVisible();
    const use = dialog.getByRole("button", { name: /Use/ }).first();
    await expect(dialog.getByTestId("preview-summary").first()).toBeVisible();
    await step(page, () => use.click());

    const choice = page.getByRole("dialog", { name: /Choose/ });
    if (await choice.isVisible()) {
      await step(page, () =>
        choice
          .getByRole("button", { name: /Choose/ })
          .first()
          .click(),
      );
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("your-leader")).toContainText("Used");
    if (kind === "lookAtOpponentHand") {
      // Revealed cards are shown to you.
      await expect(page.getByRole("button", { name: /Seen in hand:/ })).toBeVisible();
      await page.getByRole("button", { name: /Seen in hand:/ }).click();
      await expect(
        page.getByRole("dialog", { name: /Cards seen/ }).locator(".cd-card"),
      ).toHaveCount(3);
    }
  });
}

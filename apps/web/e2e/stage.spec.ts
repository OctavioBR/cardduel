import { expect, test } from "@playwright/test";
import { keepHand, settled } from "./board";

test("every piece of the view is visible on the stage, and piles open their overlays", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1520, height: 720 });
  await page.goto("/dev/local?seed=7&deck=starter");
  const radios = page.getByTestId("seat-toggle").getByRole("radio");
  for (const seat of [0, 1]) {
    await radios.nth(seat).check();
    await keepHand(page);
  }
  await settled(page);
  const stage = page.getByTestId("stage");
  await expect(stage).toHaveCSS("width", "1520px");

  for (const who of ["you", "opponent"]) {
    const panel = page.getByTestId(`panel-${who}`);
    await expect(panel.getByRole("img", { name: "2 Gems" })).toBeVisible();
    await expect(panel.getByText(/Hand \d+/)).toBeVisible();
    await expect(
      panel.getByText(/Leader .*, Ready/).or(panel.locator(".leader-state")),
    ).toBeVisible();
    await expect(page.getByTestId(`score-${who}`)).toHaveText("0");
  }
  await expect(page.getByText("Round 1")).toBeVisible();
  await expect(page.getByLabel("Weather")).toBeVisible();
  await expect(page.locator(".board-row")).toHaveCount(6);
  await expect(page.getByLabel(/Opponent's deck, \d+ cards/)).toBeVisible();

  await page.getByRole("button", { name: /Your deck, \d+ cards/ }).click();
  const deck = page.getByRole("dialog", { name: /Your deck/ });
  await expect(deck).toBeVisible();
  expect(await deck.locator(".cd-card").count()).toBeGreaterThan(5);
  await page.keyboard.press("Escape");
  await expect(deck).toBeHidden();

  for (const name of [/Your Discard Pile/, /Opponent's Discard Pile/]) {
    await page.getByRole("button", { name }).click();
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  }
});

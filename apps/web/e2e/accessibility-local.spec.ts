import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Match, menus, Card Detail and Play Previews pass axe", async ({ page }) => {
  await page.goto("/dev/local?scenario=horn");
  const check = async () =>
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
  await check();
  await page.getByRole("button", { name: "War Drum" }).click();
  await page.getByRole("button", { name: /Play to the Horn slot of Your Close Row/ }).focus();
  await check();
  await page.getByRole("button", { name: "Forfeit", exact: true }).click();
  await check();
});

test("dialogs trap Tab, restore focus and isolate background controls", async ({ page }) => {
  await page.goto("/dev/local?scenario=horn");
  // The board's Forfeit button; its confirmation dialog has a Forfeit button of its own.
  const forfeit = page.locator("button.forfeit-button");
  await forfeit.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Forfeit this Match?", exact: true });
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Keep playing" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  expect(await forfeit.evaluate((el) => !!el.closest("[inert]"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(forfeit).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("i");
  const detail = page.getByTestId("card-detail");
  await expect(detail.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(detail.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("hand-card").first()).toBeFocused();
});

test("pile cards open keyboard Card Detail above the pile dialog", async ({ page }) => {
  await page.goto("/dev/local?scenario=medic");
  const pile = page.getByRole("button", { name: /Your Discard Pile/ });
  await pile.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /Your Discard Pile/ });
  await page.keyboard.press("Tab");
  await page.keyboard.press("i");
  const detail = page.getByTestId("card-detail");
  await expect(detail.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(pile).toBeFocused();
});

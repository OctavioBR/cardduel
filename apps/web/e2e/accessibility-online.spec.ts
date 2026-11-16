import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUpVia, uniqueName } from "./board";

test("authentication, Home, Decks, Deck builder and Room pass axe", async ({ page }) => {
  const check = async () =>
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
  await page.goto("/signin");
  await check();
  await page.goto("/signup");
  await check();
  await signUpVia(page, uniqueName("axe"));
  await check();
  await page.goto("/decks");
  await check();
  await page.getByRole("button", { name: "Copy a Starter Deck" }).click();
  await expect(page).toHaveURL(/\/decks\/.+/);
  await check();
  await page.goto("/");
  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page).toHaveURL(/\/r\/.+/);
  await check();
});

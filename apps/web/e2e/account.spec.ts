import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installClerkFixture, signUpVia } from "./board";

test("Google sign-in asks for a display name and account settings can change it", async ({
  page,
}) => {
  await installClerkFixture(page);
  await page.goto("/signin?next=%2Fdecks");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Choose your display name" })).toBeVisible();
  await expect(page.getByLabel("Display name", { exact: true })).toBeFocused();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.getByLabel("Display name", { exact: true }).fill("Geralt");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/decks$/);
  await page.getByRole("button", { name: "Geralt", exact: true }).click();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await page.getByLabel("Display name", { exact: true }).fill("<b>雪 $&</b>");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Display name saved.");
  await expect(page.getByRole("button", { name: "<b>雪 $&</b>", exact: true })).toBeVisible();
  await expect(page.locator(".account-menu b")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("<b>雪 $&</b>");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
});

test("players may choose the same display name and keep independent profiles", async ({
  browser,
}) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signUpVia(a, "Geralt");
  await signUpVia(b, "Geralt");
  const identity = (page: typeof a) =>
    page.evaluate(
      async () => (await (await fetch("/api/me")).json()) as { account: { id: string } },
    );
  expect((await identity(a)).account.id).not.toBe((await identity(b)).account.id);
  await a.goto("/account");
  await a.getByLabel("Display name", { exact: true }).fill("Yennefer");
  await a.getByRole("button", { name: "Save", exact: true }).click();
  await expect(a.getByRole("status")).toHaveText("Display name saved.");
  await b.reload();
  await expect(b.getByRole("button", { name: "Geralt", exact: true })).toBeVisible();
});

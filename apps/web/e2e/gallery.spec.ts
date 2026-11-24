import { expect, test } from "@playwright/test";

for (const scale of [1, 2]) {
  test.describe(`at ${scale}x device pixel ratio`, () => {
    test.use({ deviceScaleFactor: scale });

    test("the gallery renders every catalog card at every size", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        // Resource loads can fail when no Worker runs behind Vite; only app errors count.
        if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
          errors.push(m.text());
      });
      await page.goto("/dev/cards");
      const rows = page.getByTestId("gallery-card");
      await expect(rows.first()).toBeVisible();
      const count = await rows.count();
      expect(count).toBeGreaterThan(50);
      for (const size of ["token", "hand", "tile", "detail"]) {
        expect(await page.locator(`.cd-${size}`).count()).toBeGreaterThanOrEqual(count);
      }
      await expect(rows.locator(".cd-detail img")).toHaveCount(count);
      const art = rows.first().locator(".cd-detail img");
      await expect
        .poll(() => art.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  });
}

test("the gallery menu jumps to every Faction and Neutral Cards", async ({ page }) => {
  await page.goto("/dev/cards");
  const menu = page.getByRole("navigation", { name: "Jump to cards" });
  await expect(menu.getByRole("link")).toHaveCount(6);
  for (const [name, faction] of [
    ["Swarm", "swarm"],
    ["Court", "court"],
    ["Kingdom", "kingdom"],
    ["Vikings", "vikings"],
    ["Elves", "elves"],
    ["Neutral Cards", "neutral"],
  ]) {
    const group = page.getByRole("region", { name, exact: true });
    const heading = group.getByRole("heading", { name });
    await menu.getByRole("link", { name }).press("Enter");
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(menu).toBeInViewport({ ratio: 1 });
    const cards = group.locator(".cd-detail");
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(group.locator(`.cd-detail:not(.cd-f-${faction})`)).toHaveCount(0);
  }
});

test("on narrow screens the gallery menu stays above the jump destination", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/dev/cards");
  const menu = page.getByRole("navigation", { name: "Jump to cards" });
  await menu.getByRole("link", { name: "Neutral Cards" }).click();
  const heading = page.getByRole("heading", { name: "Neutral Cards" });
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect(menu).toBeInViewport({ ratio: 1 });
  const menuBottom = await menu.evaluate((element) => element.getBoundingClientRect().bottom);
  const headingTop = await heading.evaluate((element) => element.getBoundingClientRect().top);
  expect(headingTop).toBeGreaterThan(menuBottom);
});

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
      // Vector only: no raster card art that could blur at 2x.
      expect(await page.locator(".cd-card img").count()).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

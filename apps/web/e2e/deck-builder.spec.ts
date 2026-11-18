import { expect, type Locator, type Page, test } from "@playwright/test";
import { signUpVia, uniqueName } from "./board";

async function units(page: Page): Promise<number> {
  return Number(((await page.getByTestId("count-units").textContent()) ?? "0/22").split("/")[0]);
}

async function newDeck(page: Page) {
  await signUpVia(page, uniqueName("builder"), "/decks");
  await page.getByRole("button", { name: "New Deck" }).click();
  await expect(page).toHaveURL(/\/decks\/[0-9a-f-]+$/);
  await expect(page.getByTestId("deck-panel")).toBeVisible();
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("build a Valid Deck from scratch; Competitive warnings appear; saved changes survive a reload", async ({
  page,
}) => {
  await newDeck(page);
  await expect(page.getByTestId("deck-error")).toContainText(["Choose a Leader."]);
  await page.getByRole("radio", { name: "Queen of the Deep Hive" }).check();

  // The pool lists the strongest Units first: taking them breaks the 130 Strength cap.
  for (let i = 0; i < 40 && (await units(page)) < 22; i++) {
    await page.locator('[data-testid="pool-tile"]:enabled').first().click();
  }
  expect(await units(page)).toBe(22);
  await expect(page.getByTestId("deck-status")).toContainText("Valid Deck");
  await expect(page.getByTestId("deck-error")).toHaveCount(0);
  await expect(page.getByTestId("deck-warning")).toContainText("total Unit Strength");

  // Spent tiles stay in place, greyed out at ×0.
  const spent = page.locator('[data-testid="pool-tile"]:disabled').first();
  await expect(spent).toContainText("×0");

  // Edits stay local until Save; Undo steps back through them.
  await expect(page.getByTestId("save-state")).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await units(page)).toBe(21);
  await page.locator('[data-testid="pool-tile"]:enabled').first().click();
  expect(await units(page)).toBe(22);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("count-units")).toHaveText("22/22");
  await expect(page.getByRole("radio", { name: "Queen of the Deep Hive" })).toBeChecked();
  await expect(page.getByTestId("deck-warning")).toBeVisible();
});

test("drag adds a card from the pool and removes it back", async ({ page }) => {
  await newDeck(page);
  const tile = page.locator('[data-testid="pool-tile"]:enabled').first();
  const from = await center(tile);
  const to = await center(page.getByTestId("deck-panel"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 10, { steps: 3 });
  await expect(page.getByTestId("tile-ghost")).toBeVisible();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("count-units")).toHaveText("1/22");

  const deckTile = page.getByTestId("deck-tile").first();
  const back = await center(deckTile);
  // The pool is tall; drop near its top, inside the viewport.
  const box = await page.getByRole("region", { name: "Card pool" }).boundingBox();
  if (!box) throw new Error("no pool");
  const pool = { x: box.x + 40, y: box.y + 20 };
  await page.mouse.move(back.x, back.y);
  await page.mouse.down();
  await page.mouse.move(back.x - 30, back.y, { steps: 3 });
  await page.mouse.move(pool.x, pool.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("count-units")).toHaveText("0/22");
});

test("new players have a Competitive Starter Deck for each Faction after signing up", async ({
  page,
}) => {
  await signUpVia(page, uniqueName("seeded"), "/decks");
  for (const faction of ["Swarm", "Court"]) {
    await page.getByRole("tab", { name: faction, exact: true }).click();
    await expect(page.locator(".deck-list li")).toHaveCount(1);
    await page.getByRole("link", { name: `${faction} Starter`, exact: true }).click();
    await expect(page.getByTestId("deck-status")).toHaveText("Competitive Deck");
    await page.goto("/decks");
  }
});

test("Copy a Starter Deck gives an additional Competitive Deck; filters narrow the pool", async ({
  page,
}) => {
  await signUpVia(page, uniqueName("starter"), "/decks");
  await page.getByRole("tab", { name: "Court" }).click();
  await page.getByRole("button", { name: "Copy a Starter Deck" }).click();
  await expect(page.getByTestId("deck-status")).toHaveText("Competitive Deck");

  await page.getByLabel("Type").selectOption("special");
  const tiles = page.getByTestId("pool-tile");
  const ids = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-card") ?? ""));
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(id.startsWith("neutral-")).toBe(true);
  await page.getByLabel("Type").selectOption("all");
  await page.getByLabel("Ability").selectOption("spy");
  const spies = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-card") ?? ""));
  expect(spies.sort()).toEqual([
    "court-double-agent",
    "court-masked-envoy",
    "court-palace-informant",
  ]);
});

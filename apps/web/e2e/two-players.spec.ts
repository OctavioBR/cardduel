import { expect, type Page, test } from "@playwright/test";
import {
  actionCount,
  isMyTurn,
  keepForRound,
  matchOver,
  passTurn,
  round,
  settled,
  signUpVia,
  uniqueName,
} from "./board";

/**
 * The whole product with two players. The local Worker runs with a fixed Match seed (see
 * `playwright.config.ts`): with the two Starter Decks it deals the first Seat a Brood Tender (a
 * Medic) and Wildfire (Scorch) in the opening hand, and that Seat plays first.
 */

/** Cards the generic play skips: the journey plays the first two on purpose, and the others need a target of their own (a Unit, a Horn slot). */
const HELD = ["Brood Tender", "Wildfire", "Straw Double", "War Drum"];

interface Seen {
  medic: boolean;
  scorch: boolean;
}

async function openStarterDeck(page: Page, faction: "Swarm" | "Court"): Promise<void> {
  await page.goto("/decks");
  await page.getByRole("tab", { name: faction }).click();
  await page.getByRole("link", { name: `${faction} Starter`, exact: true }).click();
  await expect(page.getByTestId("deck-status")).toHaveText("Competitive Deck");
}

async function discardCount(page: Page): Promise<number> {
  const label = await page
    .getByRole("button", { name: /^Your Discard Pile, \d+ cards$/ })
    .getAttribute("aria-label");
  return Number(label?.match(/(\d+) cards/)?.[1] ?? 0);
}

/** Names of the hand cards that can be played now. */
async function playableNames(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="hand-card"]:enabled')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
}

/** Answers every Pending Choice (a Medic Plays a Unit from the Discard Pile) with its first option. */
async function resolveChoices(page: Page): Promise<void> {
  const choice = page.getByRole("dialog", { name: /Medic/ });
  while (await choice.isVisible({ timeout: 1000 }).catch(() => false)) {
    const before = await actionCount(page);
    await choice
      .getByRole("button", { name: /^Choose/ })
      .first()
      .click();
    await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
    await settled(page);
  }
}

/** Selects a hand card by name and plays it on its only target (a Row, or the battlefield). */
async function play(page: Page, name: string): Promise<void> {
  const before = await actionCount(page);
  await page.locator(`[data-testid="hand-card"]:enabled[aria-label^="${name}"]`).first().click();
  await page.locator("button.board-row.target, button.battlefield-target").first().click();
  await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
}

const unitsOnBoard = (page: Page) => page.locator(".unit:not(.ghost)").count();

/** One Turn: the held Medic or Scorch when it counts, else a few cards a Round, then Pass. */
async function takeJourneyTurn(page: Page, seen: Seen): Promise<void> {
  await settled(page);
  const current = await round(page);
  const names = await playableNames(page);
  const holds = (name: string) => names.some((n) => n.startsWith(name));

  if (current >= 2 && holds("Brood Tender") && (await discardCount(page)) > 0) {
    await play(page, "Brood Tender");
    await expect(page.getByRole("dialog", { name: /Medic/ })).toBeVisible();
    await resolveChoices(page);
    seen.medic = true;
    return;
  }
  const units = await unitsOnBoard(page);
  if (current >= 2 && holds("Wildfire") && units >= 2 && (seen.medic || current === 3)) {
    await play(page, "Wildfire");
    await expect.poll(() => unitsOnBoard(page)).toBeLessThan(units);
    seen.scorch = true;
    return;
  }
  const spare = names.find((n) => !HELD.some((h) => n.startsWith(h)));
  if (spare !== undefined && names.length > keepForRound(current)) {
    await play(page, spare);
    await resolveChoices(page);
  } else {
    const before = await actionCount(page);
    await passTurn(page);
    await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
  }
}

/** Returns one card the journey does not need, then ends the Redraw. */
async function redrawOne(page: Page): Promise<void> {
  const redraw = page.getByTestId("redraw");
  await expect(redraw).toBeVisible();
  const before = await actionCount(page);
  await redraw
    .getByRole("button", { name: /^Return (?!Brood Tender|Wildfire)/ })
    .first()
    .click();
  await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
  await expect(redraw).toContainText("1/2 returned");
  await redraw.getByRole("button", { name: "Done", exact: true }).click();
  await expect(redraw).toHaveCount(0);
}

test("two players: Decks, Competitive Room, Redraw, Scorch, Medic, Match end and Rematch", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const alice = await a.newPage();
    const bob = await b.newPage();
    await signUpVia(alice, uniqueName("alice"), "/decks");
    await openStarterDeck(alice, "Swarm");
    await signUpVia(bob, uniqueName("bob"), "/decks");
    await openStarterDeck(bob, "Court");

    await alice.goto("/");
    await alice.getByLabel("Competitive Room").check();
    await alice
      .getByLabel("Deck", { exact: true })
      .selectOption({ label: "Swarm Starter · Swarm" });
    await alice.getByRole("button", { name: "Create Room" }).click();
    await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
    const url = alice.url();
    await expect(alice.getByText("Competitive Room", { exact: true })).toBeVisible();
    await expect(alice.getByText("You chose Swarm Starter", { exact: false })).toBeVisible();
    await bob.goto(url);
    await expect(bob.getByText("Competitive Room", { exact: true })).toBeVisible();
    await bob.getByRole("button", { name: /Court Starter/ }).click();
    await expect(alice.getByTestId("board")).toBeVisible();
    await expect(bob.getByTestId("board")).toBeVisible();

    await redrawOne(alice);
    await redrawOne(bob);
    await expect(alice.getByTestId("turn")).toHaveText(/Your Turn|Opponent's Turn/);

    const seen: Seen = { medic: false, scorch: false };
    for (let i = 0; i < 200 && !(await matchOver(alice)); i++) {
      for (const page of [alice, bob]) {
        if (!(await matchOver(page)) && (await isMyTurn(page))) await takeJourneyTurn(page, seen);
      }
    }
    const result = /You won the Match|You lost the Match|Draw/;
    await expect(alice.getByTestId("result")).toHaveText(result);
    await expect(bob.getByTestId("result")).toHaveText(result);
    expect(seen).toEqual({ medic: true, scorch: true });

    await alice.getByRole("button", { name: "Rematch", exact: true }).click();
    await expect(bob.getByTestId("rematch-status")).toContainText("offered a Rematch");
    await bob.getByRole("button", { name: "Rematch", exact: true }).click();
    await alice.getByRole("button", { name: /Swarm Starter/ }).click();
    await bob.getByRole("button", { name: /Court Starter/ }).click();
    await expect(alice.getByTestId("redraw")).toBeVisible();
    await expect(bob.getByTestId("redraw")).toBeVisible();
    await expect(alice.getByTestId("result")).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});

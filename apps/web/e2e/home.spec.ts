import { expect, type Page, test } from "@playwright/test";
import { keepHand, signUpVia, uniqueName } from "./board";

/** Selects one of the player's seeded Starter Decks on Home. */
async function starter(page: Page, faction: "swarm" | "court"): Promise<string> {
  const picker = page.getByLabel("Deck", { exact: true });
  const name = faction === "swarm" ? "Swarm" : "Court";
  await picker.selectOption({ label: `${name} Starter · ${name}` });
  return picker.inputValue();
}

for (const competitive of [false, true]) {
  test(`Home creates a ${competitive ? "Competitive" : "Casual"} Room, copies its link and joins by code`, async ({
    browser,
  }) => {
    const hostContext = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const guestContext = await browser.newContext();
    try {
      const host = await hostContext.newPage();
      const guest = await guestContext.newPage();
      await signUpVia(host, uniqueName("host"));
      await expect(host.getByTestId("record-wins")).toHaveText("0");
      await expect(host.getByTestId("record-losses")).toHaveText("0");
      await expect(host.getByTestId("record-draws")).toHaveText("0");
      await expect(host.getByTestId("record-disconnectWins")).toHaveText("0");
      await expect(host.getByTestId("record-disconnectLosses")).toHaveText("0");
      // The viewer always counts among the Recently Active Players (#119).
      await expect(host.getByTestId("recently-active")).toHaveText(
        /^\d+ recently active players?$/,
      );
      await expect(host.getByRole("button", { name: "Find a Match" })).toBeEnabled();
      await expect(host.getByRole("button", { name: "Create Room" })).toBeEnabled();
      await starter(host, "swarm");
      await host.getByRole("main").getByRole("link", { name: "My Decks" }).click();
      await expect(host).toHaveURL(/\/decks$/);
      await host.goto("/");
      await starter(host, "swarm");
      await expect(host.getByLabel("Deck", { exact: true })).toHaveValue(/.+/);
      await host.getByLabel("Competitive Room").setChecked(competitive);
      await host.getByRole("button", { name: "Create Room" }).click();
      await expect(host).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
      const url = host.url();
      const code = url.split("/").pop() ?? "";
      await expect(host.getByRole("heading", { name: `Room ${code}` })).toBeVisible();
      await expect(
        host.getByText(competitive ? "Competitive Room" : "Casual Room", { exact: true }),
      ).toBeVisible();
      await expect(host.getByText("You chose Swarm Starter", { exact: false })).toBeVisible();
      await expect(host.getByText(/Waiting for your opponent. Share/)).toBeVisible();
      await host.getByRole("button", { name: "Copy link" }).click();
      await expect(host.getByRole("status")).toHaveText("Link copied");
      expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(url);
      await signUpVia(guest, uniqueName("guest"));
      await starter(guest, "court");
      await guest.getByLabel("Room code").fill(code.toLowerCase());
      await guest.getByRole("button", { name: "Join", exact: true }).click();
      await expect(guest).toHaveURL(url);
      // Joining from Home seats the guest with the Home Deck, so the Match starts.
      await expect(host.getByTestId("board")).toBeVisible();
      await expect(guest.getByTestId("board")).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
}

test("Home offers Deck creation and disables play after all Decks are deleted", async ({
  page,
}) => {
  await signUpVia(page, uniqueName("empty"));
  const response = await page.request.get("/api/decks");
  expect(response.ok()).toBe(true);
  const { decks } = (await response.json()) as { decks: { id: string }[] };
  for (const deck of decks) {
    const deleted = await page.request.delete(`/api/decks/${deck.id}`, {
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(deleted.status()).toBe(204);
  }
  await page.reload();
  await expect(page.getByRole("link", { name: "Create your first Deck" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find a Match" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create Room" })).toBeDisabled();
});

test("Competitive toggles turn off and stay off while the Deck is not a Competitive Deck", async ({
  page,
}) => {
  await signUpVia(page, uniqueName("toggles"));
  const origin = new URL(page.url()).origin;
  const starterDeck = await starter(page, "court");
  const { deck } = (await (await page.request.get(`/api/decks/${starterDeck}`)).json()) as {
    deck: { leader: string; cards: string[] };
  };
  // Three more Special Cards: still a Valid Deck, no longer a Competitive Deck.
  const heavy = await page.request.post("/api/decks", {
    data: {
      name: "Heavy Court",
      faction: "court",
      leader: deck.leader,
      cards: [...deck.cards, "neutral-mudslide", "neutral-thunderhead", "neutral-black-ice"],
    },
    headers: { Origin: origin },
  });
  expect(heavy.status()).toBe(201);
  await page.reload();

  const picker = page.getByLabel("Deck", { exact: true });
  const queue = page.getByLabel("Competitive Queue");
  const room = page.getByLabel("Competitive Room");
  // The most recently edited Deck is selected by default.
  await expect(picker.locator("option:checked")).toHaveText("Heavy Court · Court");
  await expect(queue).toBeDisabled();
  await expect(room).toBeDisabled();
  await expect(page.getByText(/Not a Competitive Deck: .*at most 5 Special Cards/)).toBeVisible();

  await picker.selectOption({ label: "Court Starter · Court" });
  await queue.check();
  await room.check();
  await picker.selectOption({ label: "Heavy Court · Court" });
  await expect(queue).not.toBeChecked();
  await expect(room).not.toBeChecked();
  await expect(queue).toBeDisabled();
  await expect(room).toBeDisabled();
  // Back on a Competitive Deck, the toggles are available again but start off.
  await picker.selectOption({ label: "Court Starter · Court" });
  await expect(queue).toBeEnabled();
  await expect(queue).not.toBeChecked();
  await expect(room).not.toBeChecked();
});

test("Find a Match pairs two players into a Matched Room with a Turn Timer", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    await signUpVia(alice, uniqueName("queuea"));
    await starter(alice, "swarm");
    await signUpVia(bob, uniqueName("queueb"));
    await starter(bob, "court");
    // Cancel leaves the Queue.
    await alice.getByRole("button", { name: "Find a Match" }).click();
    await expect(alice.getByRole("status").filter({ hasText: "Searching…" })).toBeVisible();
    await expect(alice.getByTestId("search-time")).toHaveText(/^0:0\d$/);
    await alice.getByRole("button", { name: "Cancel" }).click();
    await expect(alice.getByRole("button", { name: "Find a Match" })).toBeVisible();

    await alice.getByLabel("Competitive Queue").check();
    await alice.getByRole("button", { name: "Find a Match" }).click();
    await expect(alice.getByRole("status").filter({ hasText: "Searching…" })).toBeVisible();
    await bob.getByLabel("Competitive Queue").check();
    await bob.getByRole("button", { name: "Find a Match" }).click();
    await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
    await expect(bob).toHaveURL(alice.url());
    await expect(alice.getByTestId("board")).toBeVisible();
    await expect(bob.getByTestId("board")).toBeVisible();
    // Redraw: each player has their own countdown, and sees the other's.
    await expect(alice.getByTestId("turn-timer-you")).toHaveText(/^Your time [12]:\d\d$/);
    await expect(alice.getByTestId("turn-timer-opponent")).toHaveText(/^Opponent's time /);
    await keepHand(alice);
    await keepHand(bob);
    await expect(alice.locator(".turn-timer")).toHaveCount(1);
  } finally {
    await first.close();
    await second.close();
  }
});

test("Create Room with a Turn Timer shows it in the lobby", async ({ page }) => {
  await signUpVia(page, uniqueName("timer"));
  await starter(page, "swarm");
  await page.getByLabel("Turn Timer", { exact: true }).check();
  await page.getByLabel("Turn Timer length in seconds").fill("20");
  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page.getByRole("alert")).toHaveText("A Turn Timer lasts from 30 to 600 seconds.");
  await page.getByLabel("Turn Timer length in seconds").fill("45");
  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  await expect(page.getByText("Casual Room · Turn Timer 0:45", { exact: true })).toBeVisible();
});

test("Home refreshes Records after a Forfeit", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    for (const page of [alice, bob]) {
      await signUpVia(page, uniqueName("record"));
      await starter(page, "swarm");
    }
    await alice.getByRole("button", { name: "Create Room" }).click();
    await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
    await bob.reload();
    const bobDefault = await bob
      .getByLabel("Deck", { exact: true })
      .locator("option:checked")
      .textContent();
    await bob.goto(alice.url());
    // Opening a shared link keeps the Room's Deck picker, with the default Deck preselected.
    const bobDeck = bob.getByRole("button", {
      name: bobDefault?.startsWith("Swarm") ? /Swarm Starter/ : /Court Starter/,
    });
    await expect(bobDeck).toHaveAttribute("aria-pressed", "true");
    await bobDeck.click();
    await expect(alice.getByTestId("board")).toBeVisible();
    await alice.getByRole("button", { name: "Keep hand" }).click();
    await bob.getByRole("button", { name: "Keep hand" }).click();
    await alice.getByRole("button", { name: "Forfeit", exact: true }).click();
    await alice
      .getByRole("dialog", { name: "Forfeit this Match?" })
      .getByRole("button", { name: "Forfeit" })
      .click();
    await expect(alice.getByTestId("result")).toHaveText("You lost the Match");
    await alice.getByRole("button", { name: "Leave" }).click();
    await expect(alice.getByTestId("record-losses")).toHaveText("1");
    await bob.goto("/");
    await expect(bob.getByTestId("record-wins")).toHaveText("1");
  } finally {
    await first.close();
    await second.close();
  }
});

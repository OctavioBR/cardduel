import { expect, type Page, test } from "@playwright/test";
import { keepHand, signUpFromSignIn, signUpVia, uniqueName } from "./board";

test("new players take Seats with their seeded Starter Decks and start a Match", async ({
  browser,
}) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();

  await signUpVia(alice, uniqueName("alice"));
  await alice.getByLabel("Deck", { exact: true }).selectOption({ label: "Swarm Starter · Swarm" });
  await alice.getByRole("button", { name: "Create Room" }).click();
  await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  const code = alice.url().split("/").pop() ?? "";
  // The Home Deck takes the Seat.
  await expect(alice.getByText("You chose Swarm Starter", { exact: false })).toBeVisible();

  await signUpVia(bob, uniqueName("bob"));
  await bob.getByLabel("Deck", { exact: true }).selectOption({ label: "Court Starter · Court" });
  await bob.getByLabel("Room code").fill(code.toLowerCase());
  await bob.getByRole("button", { name: "Join" }).click();
  await expect(bob).toHaveURL(new RegExp(`/r/${code}$`));

  await expect(alice.getByTestId("board")).toBeVisible();
  await expect(bob.getByTestId("board")).toBeVisible();
  await keepHand(alice);
  await keepHand(bob);
  await expect(alice.getByTestId("turn")).toHaveText(/Your Turn|Opponent's Turn/);
});

test("a third player sees Room full", async ({ browser }) => {
  const pages = await Promise.all(
    [0, 1, 2].map(async () => (await browser.newContext()).newPage()),
  );
  const [first, second, third] = pages as [Page, Page, Page];
  await signUpVia(first, uniqueName("first"));
  await first.getByLabel("Deck", { exact: true }).selectOption({ label: "Swarm Starter · Swarm" });
  await first.getByRole("button", { name: "Create Room" }).click();
  await expect(first).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  await expect(first.getByText("You chose Swarm Starter", { exact: false })).toBeVisible();
  const url = first.url();
  await second.goto(url);
  await signUpFromSignIn(second, uniqueName("second"));
  await second.reload();
  await second.getByRole("button", { name: /Court Starter/ }).click();
  await expect(second.getByTestId("board")).toBeVisible();
  await third.goto(url);
  await signUpFromSignIn(third, uniqueName("third"));
  await expect(third.getByRole("heading", { name: "Room full" })).toBeVisible();
});

test("a signed-out player opens a Room link, is sent to sign in, signs up and lands in the Room", async ({
  browser,
}) => {
  const host = await (await browser.newContext()).newPage();
  await signUpVia(host, uniqueName("host"));
  await host.getByLabel("Deck", { exact: true }).selectOption({ label: "Swarm Starter · Swarm" });
  await host.getByRole("button", { name: "Create Room" }).click();
  await expect(host).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  await expect(host.getByText("You chose Swarm Starter", { exact: false })).toBeVisible();
  const url = host.url();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(url);
  await expect(guest).toHaveURL(/\/signin\?next=%2Fr%2F[2-9A-Z]{6}$/);
  await signUpFromSignIn(guest, uniqueName("guest"));
  await expect(guest).toHaveURL(url);
  await guest.reload();
  await guest.getByRole("button", { name: /Court Starter/ }).click();
  await expect(guest.getByTestId("board")).toBeVisible();
  await expect(host.getByTestId("board")).toBeVisible();
});

test("sign in, and sign out from the account menu", async ({ page }) => {
  const name = uniqueName("menu");
  await signUpVia(page, name);
  await page.getByRole("button", { name }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  // Signed out, every page sends the player to sign in; the header offers no account links.
  await expect(page).toHaveURL(/\/signin\?next=%2F$/);
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("Rematch offer, acceptance with last Deck selected, and leaving decline", async ({
  browser,
}) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await signUpVia(alice, uniqueName("rematcha"));
  await alice.getByLabel("Deck", { exact: true }).selectOption({ label: "Swarm Starter · Swarm" });
  await alice.getByRole("button", { name: "Create Room" }).click();
  await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  const url = alice.url();
  await expect(alice.getByText("You chose Swarm Starter", { exact: false })).toBeVisible();
  await signUpVia(bob, uniqueName("rematchb"));
  await bob.goto(url);
  await bob.getByRole("button", { name: /Court Starter/ }).click();
  async function forfeit() {
    await keepHand(alice);
    await keepHand(bob);
    await alice.getByRole("button", { name: "Forfeit", exact: true }).click();
    await alice
      .getByRole("dialog", { name: "Forfeit this Match?" })
      .getByRole("button", { name: "Forfeit" })
      .click();
    await expect(bob.getByRole("button", { name: "Rematch", exact: true })).toBeVisible();
  }
  await forfeit();
  await alice.getByRole("button", { name: "Rematch", exact: true }).click();
  await expect(bob.getByTestId("rematch-status")).toContainText("offered a Rematch");
  await bob.getByRole("button", { name: "Rematch", exact: true }).click();
  const aDeck = alice.getByRole("button", { name: /Swarm Starter/ });
  const bDeck = bob.getByRole("button", { name: /Court Starter/ });
  await expect(aDeck).toHaveAttribute("aria-pressed", "true");
  await expect(bDeck).toHaveAttribute("aria-pressed", "true");
  expect(alice.url()).toBe(url);
  expect(bob.url()).toBe(url);
  await aDeck.click();
  await bDeck.click();
  await forfeit();
  await alice.getByRole("button", { name: "Rematch", exact: true }).click();
  await bob.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(alice.getByTestId("rematch-status")).toContainText("Rematch declined");
  await expect(alice.getByRole("button", { name: "Rematch", exact: true })).toBeDisabled();
});

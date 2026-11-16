import { expect, type Page, test } from "@playwright/test";
import { fillAuthForm, keepHand, signUpVia, uniqueName } from "./board";

async function copyStarter(page: Page, faction: "swarm" | "court") {
  await page.waitForFunction(async () => {
    const response = await fetch("/api/me", { credentials: "same-origin" });
    return response.ok && !!((await response.json()) as { account?: unknown }).account;
  });
  const status = await page.evaluate(
    async (f) =>
      (
        await fetch("/api/decks/copy-starter", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faction: f }),
        })
      ).status,
    faction,
  );
  expect(status).toBe(201);
}

test("two accounts take Seats with real Decks and start a Match", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();

  await signUpVia(alice, uniqueName("alice"));
  await copyStarter(alice, "swarm");
  await alice.getByRole("button", { name: "Create Room" }).click();
  await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  const code = alice.url().split("/").pop() ?? "";
  await alice.getByRole("button", { name: /Swarm Starter/ }).click();

  await signUpVia(bob, uniqueName("bob"));
  await copyStarter(bob, "court");
  await bob.getByLabel("Room code").fill(code.toLowerCase());
  await bob.getByRole("button", { name: "Join" }).click();
  await expect(bob).toHaveURL(new RegExp(`/r/${code}$`));

  await bob.getByRole("button", { name: /Court Starter/ }).click();
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
  await copyStarter(first, "swarm");
  await first.getByRole("button", { name: "Create Room" }).click();
  await expect(first).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  await first.getByRole("button", { name: /Swarm Starter/ }).click();
  const url = first.url();
  await second.goto(url);
  await fillAuthForm(second, uniqueName("second"));
  await copyStarter(second, "court");
  await second.reload();
  await second.getByRole("button", { name: /Court Starter/ }).click();
  await expect(second.getByTestId("board")).toBeVisible();
  await third.goto(url);
  await fillAuthForm(third, uniqueName("third"));
  await expect(third.getByRole("heading", { name: "Room full" })).toBeVisible();
});

test("a signed-out player opens a Room link, signs up on that page and lands in the Room", async ({
  browser,
}) => {
  const host = await (await browser.newContext()).newPage();
  await signUpVia(host, uniqueName("host"));
  await copyStarter(host, "swarm");
  await host.getByRole("button", { name: "Create Room" }).click();
  await expect(host).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  await host.getByRole("button", { name: /Swarm Starter/ }).click();
  const url = host.url();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(url);
  await expect(guest.getByText("You need an account to take a Seat")).toBeVisible();
  await fillAuthForm(guest, uniqueName("guest"));
  await expect(guest).toHaveURL(url);
  await copyStarter(guest, "court");
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
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Username").fill(name.toUpperCase());
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name })).toBeVisible();
  await page.goto("/signin");
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong username or password.");
});

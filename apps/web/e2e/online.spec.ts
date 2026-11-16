import { expect, type Page, test } from "@playwright/test";
import {
  fillAuthForm,
  isMyTurn,
  keepForRound,
  keepHand,
  matchOver,
  round,
  signUpVia,
  takeTurn,
  uniqueName,
} from "./board";

test("two players create, join and finish a Match", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();

  await signUpVia(alice, uniqueName("alice"));
  await alice.getByRole("button", { name: "Create Room" }).click();
  await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  const code = alice.url().split("/").pop() ?? "";
  await expect(alice.getByText("Waiting for your opponent")).toBeVisible();

  await signUpVia(bob, uniqueName("bob"));
  await bob.getByLabel("Room code").fill(code.toLowerCase());
  await bob.getByRole("button", { name: "Join" }).click();
  await expect(bob).toHaveURL(new RegExp(`/r/${code}$`));

  await expect(alice.getByTestId("board")).toBeVisible();
  await expect(bob.getByTestId("board")).toBeVisible();
  await keepHand(alice);
  await keepHand(bob);
  await expect(alice.getByTestId("turn")).toHaveText(/Your Turn|Opponent's Turn/);

  for (let i = 0; i < 80 && !(await matchOver(alice)); i++) {
    const mover: Page = (await isMyTurn(alice)) ? alice : bob;
    await takeTurn(mover, keepForRound(await round(mover)));
  }

  const a = await alice.getByTestId("result").textContent();
  const b = await bob.getByTestId("result").textContent();
  const pairs: Record<string, string> = {
    "You won the Match": "You lost the Match",
    "You lost the Match": "You won the Match",
    Draw: "Draw",
  };
  expect(a && pairs[a]).toBe(b);
});

test("a third player sees Room full", async ({ browser }) => {
  const pages = await Promise.all(
    [0, 1, 2].map(async () => (await browser.newContext()).newPage()),
  );
  const [first, second, third] = pages as [Page, Page, Page];
  await signUpVia(first, uniqueName("first"));
  await first.getByRole("button", { name: "Create Room" }).click();
  await expect(first).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  const url = first.url();
  await second.goto(url);
  await fillAuthForm(second, uniqueName("second"));
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
  await host.getByRole("button", { name: "Create Room" }).click();
  await expect(host).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  const url = host.url();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(url);
  await expect(guest.getByText("You need an account to take a Seat")).toBeVisible();
  await fillAuthForm(guest, uniqueName("guest"));
  await expect(guest).toHaveURL(url);
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

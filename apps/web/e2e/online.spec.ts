import { expect, type Page, test } from "@playwright/test";
import { isMyTurn, keepForRound, keepHand, matchOver, round, takeTurn } from "./board";

test("two players create, join and finish a Match", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();

  await alice.goto("/");
  await alice.getByRole("button", { name: "Create Room" }).click();
  await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  const code = alice.url().split("/").pop() ?? "";
  await expect(alice.getByText("Waiting for your opponent")).toBeVisible();

  await bob.goto("/");
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
  await first.goto("/");
  await first.getByRole("button", { name: "Create Room" }).click();
  await expect(first).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
  const url = first.url();
  await second.goto(url);
  await expect(second.getByTestId("board")).toBeVisible();
  await third.goto(url);
  await expect(third.getByRole("heading", { name: "Room full" })).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { keepHand, signUpVia, uniqueName } from "./board";

test("opponent disconnect countdown leads to a real Disconnect Win after server grace", async ({
  browser,
}) => {
  test.setTimeout(165_000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const alice = await a.newPage();
    const bob = await b.newPage();
    for (const [page, faction] of [
      [alice, "swarm"],
      [bob, "court"],
    ] as const) {
      await signUpVia(page, uniqueName(faction));
      expect(
        (
          await page.request.post("/api/decks/copy-starter", {
            data: { faction },
            headers: { Origin: new URL(page.url()).origin },
          })
        ).status(),
      ).toBe(201);
    }
    await alice.reload();
    await alice.getByRole("button", { name: "Create Room" }).click();
    await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
    await expect(alice.getByText("You chose Swarm Starter", { exact: false })).toBeVisible();
    await bob.goto(alice.url());
    await bob.getByRole("button", { name: /Court Starter/ }).click();
    await expect(alice.getByTestId("board")).toBeVisible();
    await keepHand(alice);
    await keepHand(bob);
    await b.close();
    await expect(
      alice.getByRole("status").filter({ hasText: "Your opponent disconnected." }),
    ).toContainText(/claim a Disconnect Win in \d+s/);
    await expect(alice.getByRole("button", { name: "Claim win" })).toBeVisible({
      timeout: 125_000,
    });
    await alice.getByRole("button", { name: "Claim win" }).click();
    await expect(alice.getByTestId("result")).toHaveText("You won the Match");
    await expect(
      alice.getByText("You won because your opponent stayed disconnected."),
    ).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});

test("a dropped connection blocks play while automatic retry recovers the current view", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    await a.addInitScript(() => {
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          (window as unknown as { testSocket: WebSocket }).testSocket = this;
        }
      };
    });
    const alice = await a.newPage();
    const bob = await b.newPage();
    for (const [page, faction] of [
      [alice, "swarm"],
      [bob, "court"],
    ] as const) {
      await signUpVia(page, uniqueName(faction));
      await page.request.post("/api/decks/copy-starter", {
        data: { faction },
        headers: { Origin: new URL(page.url()).origin },
      });
    }
    await alice.reload();
    await alice.getByRole("button", { name: "Create Room" }).click();
    await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
    await expect(alice.getByText("You chose Swarm Starter", { exact: false })).toBeVisible();
    await bob.goto(alice.url());
    await bob.getByRole("button", { name: /Court Starter/ }).click();
    await expect(alice.getByTestId("board")).toBeVisible();
    await a.setOffline(true);
    await alice.evaluate(() => (window as unknown as { testSocket: WebSocket }).testSocket.close());
    await expect(
      alice.getByRole("status", { name: "" }).filter({ hasText: "Reconnecting…" }),
    ).toBeVisible();
    await expect(alice.getByTestId("board").locator("xpath=ancestor::*[@inert]")).toHaveCount(1);
    await a.setOffline(false);
    await expect(alice.locator(".reconnecting-overlay")).toHaveCount(0, { timeout: 15_000 });
    await expect(alice.getByTestId("board")).toBeVisible();
    await expect(bob.getByText("Your opponent disconnected.", { exact: false })).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});

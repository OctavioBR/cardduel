import { expect, test } from "@playwright/test";
import { signUpVia, uniqueName } from "./board";

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
      await host.getByRole("main").getByRole("link", { name: "My Decks" }).click();
      await expect(host).toHaveURL(/\/decks$/);
      await host.goto("/");
      await host.getByLabel("Competitive Room").setChecked(competitive);
      await host.getByRole("button", { name: "Create Room" }).click();
      await expect(host).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
      const url = host.url();
      const code = url.split("/").pop() ?? "";
      await expect(host.getByRole("heading", { name: `Room ${code}` })).toBeVisible();
      await expect(
        host.getByText(competitive ? "Competitive Room" : "Casual Room", { exact: true }),
      ).toBeVisible();
      await expect(host.getByText(/Waiting for your opponent. Share/)).toBeVisible();
      await host.getByRole("button", { name: "Copy link" }).click();
      await expect(host.getByRole("status")).toHaveText("Link copied");
      expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(url);
      await signUpVia(guest, uniqueName("guest"));
      await guest.getByLabel("Room code").fill(code.toLowerCase());
      await guest.getByRole("button", { name: "Join", exact: true }).click();
      await expect(guest).toHaveURL(url);
      await expect(host.getByText(/is here/)).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
}

test("Home refreshes Records after a Forfeit", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const alice = await first.newPage();
    const bob = await second.newPage();
    for (const page of [alice, bob]) {
      await signUpVia(page, uniqueName("record"));
      const response = await page.request.post("/api/decks/copy-starter", {
        data: { faction: "swarm" },
      });
      expect(response.status()).toBe(201);
    }
    await alice.getByRole("button", { name: "Create Room" }).click();
    await expect(alice).toHaveURL(/\/r\/[2-9A-Z]{6}$/);
    await alice.getByRole("button", { name: /Swarm Starter/ }).click();
    await bob.goto(alice.url());
    await bob.getByRole("button", { name: /Swarm Starter/ }).click();
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

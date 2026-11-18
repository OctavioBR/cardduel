import { expect, type Page } from "@playwright/test";
import { sessionToken } from "../../../tools/testing/clerk";

export async function actionCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("board").getAttribute("data-action-count"));
}

export async function isMyTurn(page: Page): Promise<boolean> {
  return (await page.getByTestId("turn").textContent()) === "Your Turn";
}

export async function matchOver(page: Page): Promise<boolean> {
  if (await page.getByTestId("result").isVisible()) return true;
  return (await page.getByTestId("turn").textContent()) === "Match over";
}

/**
 * Takes one Turn on a page whose Turn it is: plays the first playable card while the hand is
 * fuller than `keep`, otherwise Passes. Waits for the next view.
 */
export async function takeTurn(page: Page, keep: number): Promise<void> {
  await settled(page);
  const before = await actionCount(page);
  const cards = page.locator('[data-testid="hand-card"]:enabled');
  if ((await cards.count()) > keep) {
    await cards.first().click();
    await page.locator("button.board-row.target").first().click();
  } else {
    await passTurn(page);
  }
  await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
}

/** How many cards to keep each Round: play a few, then Pass, so Matches end quickly. */
export function keepForRound(round: number): number {
  return 10 - 2 * round;
}

export async function round(page: Page): Promise<number> {
  const text = (await page.locator(".round-info").textContent()) ?? "";
  return Number(text.match(/Round (\d+)/)?.[1] ?? 1);
}

/** Keeps the opening hand if this page still has to Redraw. */
export async function keepHand(page: Page): Promise<void> {
  await settled(page);
  const keep = page.getByRole("button", { name: "Keep hand" });
  if (!(await keep.isVisible())) return;
  const before = await actionCount(page);
  await keep.click();
  await expect.poll(() => actionCount(page)).toBeGreaterThan(before);
}

/** Passes: while the hand is not empty, Pass takes two presses ("Confirm Pass"). */
export async function passTurn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Pass" }).click();
  const confirm = page.getByRole("button", { name: "Confirm Pass" });
  if (await confirm.isVisible()) await confirm.click();
}

/** Waits until event animations have finished (input is locked while they play). */
export async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId("board")).not.toHaveAttribute("data-animating", "true", {
    timeout: 15_000,
  });
  // Between Rounds, the Round result waits for Continue. It renders just after the queue ends.
  if (await roundResultShown(page)) {
    await page.getByTestId("round-result").getByRole("button", { name: "Continue" }).click();
  }
}

/** Whether the Round result overlay is up, allowing a moment for it to render. */
export async function roundResultShown(page: Page): Promise<boolean> {
  return page
    .getByTestId("round-result")
    .waitFor({ state: "visible", timeout: 400 })
    .then(() => true)
    .catch(() => false);
}

/** Unique identity for each test; public display names need not be unique. */
export function uniqueName(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
const installed = new WeakSet<Page>();
export async function installClerkFixture(page: Page) {
  if (installed.has(page)) return;
  installed.add(page);
  await page.route("https://clerk-fixture.invalid/session", async (route) => {
    const { email } = route.request().postDataJSON() as { email: string };
    await route.fulfill({
      json: { token: await sessionToken(`user_${email}`, new URL(page.url()).origin) },
    });
  });
}
export async function signUpVia(page: Page, displayName: string, next = "/"): Promise<void> {
  await installClerkFixture(page);
  await page.goto(`/signup?next=${encodeURIComponent(next)}`);
  await fillAuthForm(page, displayName);
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}
export async function signUpFromSignIn(page: Page, displayName: string): Promise<void> {
  await installClerkFixture(page);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await fillAuthForm(page, displayName);
}
export async function fillAuthForm(
  page: Page,
  displayName: string,
  password = "correct horse battery",
): Promise<void> {
  await page.getByLabel("Email", { exact: true }).fill(`${uniqueName("email")}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose your display name" })).toBeVisible();
  await page.getByLabel("Display name", { exact: true }).fill(displayName);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

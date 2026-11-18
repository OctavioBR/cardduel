import { expect, it } from "vitest";
import { secondsLeft } from "./TurnTimer";

it("counts down from the server's deadline, whatever the client's clock says", () => {
  // The client clock runs 1 hour behind the server; 30.5s were left when the view arrived.
  const serverNow = 1_000_000;
  const receivedAt = serverNow - 3_600_000;
  expect(secondsLeft(serverNow + 30_500, serverNow, receivedAt, receivedAt)).toBe(31);
  expect(secondsLeft(serverNow + 30_500, serverNow, receivedAt, receivedAt + 20_600)).toBe(10);
  expect(secondsLeft(serverNow + 30_500, serverNow, receivedAt, receivedAt + 40_000)).toBe(0);
});

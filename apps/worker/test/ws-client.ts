import { SELF } from "cloudflare:test";
import type { Action, ClientMessage, SeatView, ServerMessage } from "@card-duel/engine";
import { expect } from "vitest";

/** A test WebSocket client that queues server messages. */
export class TestSocket {
  private queue: ServerMessage[] = [];
  private waiters: Array<(m: ServerMessage) => void> = [];
  closed: { code: number } | null = null;

  constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.queue.push(message);
    });
    ws.addEventListener("close", (event) => {
      this.closed = { code: event.code };
    });
  }

  static async open(code: string, token: string): Promise<TestSocket> {
    const res = await SELF.fetch(`https://card-duel.test/api/rooms/${code}/ws?token=${token}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("No WebSocket on the response");
    ws.accept();
    return new TestSocket(ws);
  }

  next(timeoutMs = 2000): Promise<ServerMessage> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for a message")),
        timeoutMs,
      );
      this.waiters.push((m) => {
        clearTimeout(timer);
        resolve(m);
      });
    });
  }

  async nextView(): Promise<{
    view: SeatView;
    events: Extract<ServerMessage, { type: "view" }>["events"];
  }> {
    const message = await this.next();
    if (message.type !== "view") expect.fail(`Expected a view, got ${JSON.stringify(message)}`);
    return message;
  }

  send(actionCount: number, action: Action): void {
    this.ws.send(JSON.stringify({ type: "action", actionCount, action } satisfies ClientMessage));
  }

  close(): void {
    this.ws.close(1000, "done");
  }
}

export async function createRoom(): Promise<string> {
  const res = await SELF.fetch("https://card-duel.test/api/rooms", { method: "POST" });
  expect(res.status).toBe(201);
  const { code } = (await res.json()) as { code: string };
  return code;
}

/** The first legal action that is not Pass, or Pass. */
export function firstPlay(view: SeatView): Action {
  return view.legalActions.find((a) => a.type === "play") ?? { type: "pass" };
}

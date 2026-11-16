import {
  type Action,
  CLOSE_ROOM_FULL,
  CLOSE_ROOM_NOT_FOUND,
  type ClientMessage,
  type ServerMessage,
} from "@card-duel/engine";
import { bareAction, Emitter, type RoomConnection } from "./connection";

export interface WebSocketRoomOptions {
  /** Absolute ws:// or wss:// URL of the Room socket. */
  url: string;
  /** Injected for tests. */
  createSocket?: (url: string) => WebSocket;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const BACKOFF_MS = [250, 500, 1000, 2000, 4000, 8000];

/** Talks to the Room Durable Object and reconnects automatically with backoff. */
export class WebSocketRoom implements RoomConnection {
  private emitter = new Emitter();
  private socket: WebSocket | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private closedByUser = false;
  private readonly createSocket: (url: string) => WebSocket;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: WebSocketRoomOptions) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer =
      options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.connect();
  }

  getState() {
    return this.emitter.state;
  }

  subscribe(listener: Parameters<RoomConnection["subscribe"]>[0]) {
    return this.emitter.subscribe(listener);
  }

  send(action: Action): void {
    const view = this.emitter.state.view;
    if (!view || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const message: ClientMessage = {
      type: "action",
      actionCount: view.actionCount,
      action: bareAction(action),
    };
    this.socket.send(JSON.stringify(message));
  }

  takeSeat(deckId: string): void {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "takeSeat", deckId } satisfies ClientMessage));
  }

  rematch(): void {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "rematch" }));
  }

  close(): void {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "leave" }));
    this.closedByUser = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.socket?.close(1000, "Left the Room");
    this.emitter.update({ status: "closed" });
  }

  private connect(): void {
    const socket = this.createSocket(this.options.url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.attempt = 0;
      this.emitter.update({ status: "open" });
    });
    socket.addEventListener("message", (event) => this.onMessage(event.data));
    socket.addEventListener("close", (event) => this.onClose(event.code));
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let message: ServerMessage;
    try {
      message = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case "rematch":
        this.emitter.update({ rematch: message });
        break;
      case "lobby":
        this.emitter.update({
          view: null,
          rematch: null,
          seat: message.lobby.seat,
          lobby: message.lobby,
          waitingCode: message.lobby.code,
          error: null,
        });
        break;
      case "view":
        this.emitter.update(
          {
            seat: message.view.seat,
            waitingCode: null,
            lobby: null,
            view: message.view,
            error: null,
          },
          message.events,
        );
        break;
      case "error":
        this.emitter.update({ error: { code: message.code, message: message.message } });
        break;
    }
  }

  private onClose(code: number): void {
    if (this.closedByUser) return;
    // These closes are final: retrying cannot help.
    if (code === CLOSE_ROOM_FULL || code === CLOSE_ROOM_NOT_FOUND) {
      this.emitter.update({ status: "closed" });
      return;
    }
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] ?? 8000;
    this.attempt += 1;
    this.emitter.update({ status: "reconnecting" });
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
}

/** The Room socket URL for the current page origin. */
export function roomSocketUrl(code: string, origin = window.location.origin): string {
  const url = new URL(`/api/rooms/${encodeURIComponent(code)}/ws`, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// Seam C: how the connection reconnects, over sockets the test plays the
// server for: wakeups (the app came to the foreground, the network changed)
// and dead sockets found by the ping timeout.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "@effect/vitest";

import { connect } from "../src/index.ts";
import type { ClientSocket, ConnectOptions } from "../src/index.ts";

/** A socket whose server side the test plays. */
class FakeSocket extends EventTarget implements ClientSocket {
  readyState: WebSocket["readyState"] = WebSocket.CONNECTING;
  binaryType: BinaryType = "blob";
  readonly sent: unknown[] = [];
  private answersPings = true;

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(data);

    if (data === "ping" && this.answersPings) {
      queueMicrotask(() => this.receive("pong"));
    }
  }

  /** Starts closing, as a socket over a dead network does: no close event. */
  close() {
    this.readyState = WebSocket.CLOSING;
  }

  /** Stops answering pings, as when the network under it dies. */
  goSilent() {
    this.answersPings = false;
  }

  open() {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(data: string) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  /** The server closed it. */
  drop() {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code: 1006 }));
  }
}

const RETRY_MS = 60_000;

const open = (options: Partial<ConnectOptions> = {}) => {
  const sockets: FakeSocket[] = [];

  const connection = connect({
    openSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);

      return socket;
    },
    retryDelayMs: RETRY_MS,
    server: "http://192.168.1.20:7766",
    token: "token",
    ...options,
  });

  return { connection, sockets };
};

/** Lets the link's promises and zero-delay timers run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a wakeup", () => {
  it("reconnects at once while the connection waits to retry", async () => {
    const { connection, sockets } = open();
    await settle();
    sockets[0]?.open();
    sockets[0]?.drop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(connection.getState()).toBe("reconnecting");
    expect(sockets).toHaveLength(1);

    connection.wake();
    await settle();

    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(connection.getState()).toBe("connected");
    connection.close();
  });
});

describe("the ping timeout", () => {
  it("drops a socket that goes silent and retries", async () => {
    const { connection, sockets } = open({ retryDelayMs: 1000 });
    await settle();
    const [socket] = sockets;
    socket?.open();
    socket?.goSilent();
    await vi.advanceTimersByTimeAsync(14_000);

    expect(connection.getState()).toBe("connected");

    await vi.advanceTimersByTimeAsync(1000);

    expect(connection.getState()).toBe("reconnecting");
    expect(socket?.readyState).toBe(WebSocket.CLOSING);

    await vi.advanceTimersByTimeAsync(1100);

    expect(sockets).toHaveLength(2);
    connection.close();
  });

  it("drops a socket that never opens and retries", async () => {
    const { connection, sockets } = open({ retryDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(15_000);

    expect(sockets[0]?.readyState).toBe(WebSocket.CLOSING);

    await vi.advanceTimersByTimeAsync(1100);

    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(connection.getState()).toBe("connected");
    connection.close();
  });

  it("keeps a socket that answers its pings", async () => {
    const { connection, sockets } = open();
    await settle();
    sockets[0]?.open();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(connection.getState()).toBe("connected");
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.sent).toContain("ping");
    connection.close();
  });
});

describe("a wakeup while connected", () => {
  it("replaces the socket if it doesn't answer soon", async () => {
    const { connection, sockets } = open();
    await settle();
    sockets[0]?.open();
    sockets[0]?.goSilent();
    connection.wake();
    await vi.advanceTimersByTimeAsync(3100);

    expect(connection.getState()).toBe("reconnecting");

    connection.wake();
    await settle();

    expect(sockets).toHaveLength(2);
    connection.close();
  });

  it("keeps a socket that answers", async () => {
    const { connection, sockets } = open();
    await settle();
    sockets[0]?.open();
    connection.wake();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(connection.getState()).toBe("connected");
    expect(sockets).toHaveLength(1);
    connection.close();
  });
});

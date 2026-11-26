import { vi } from "vitest";

export function mockWebSocket() {
  const sockets: FakeWebSocket[] = [];

  class FakeWebSocket {
    onopen?: () => void;
    onmessage?: (event: MessageEvent<string>) => void;
    onclose?: (event: { code: number }) => void;
    send = vi.fn<(data: string) => void>();
    close = vi.fn();

    constructor(readonly url: URL) {
      sockets.push(this);
    }

    open() {
      this.onopen?.();
    }

    receive(data: string) {
      this.onmessage?.(new MessageEvent("message", { data }));
    }

    fixtures(fixturesCapturedAt: string | null) {
      this.receive(JSON.stringify({ type: "fixtures", fixturesCapturedAt }));
    }

    disconnect(code = 1006) {
      this.onclose?.({ code });
    }
  }

  vi.stubGlobal("WebSocket", FakeWebSocket);
  return sockets;
}

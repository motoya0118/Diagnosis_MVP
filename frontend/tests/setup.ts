declare global {
  // Ensure React recognises the test environment as act-compatible.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const resolveNativeFetch = (): typeof fetch => {
  if (typeof (globalThis as any).fetch === "function") {
    return (globalThis as any).fetch.bind(globalThis);
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { fetch: undiciFetch, Headers, Request, Response } = require("undici");
  (globalThis as any).fetch = undiciFetch;
  if (!(globalThis as any).Headers) {
    (globalThis as any).Headers = Headers;
  }
  if (!(globalThis as any).Request) {
    (globalThis as any).Request = Request;
  }
  if (!(globalThis as any).Response) {
    (globalThis as any).Response = Response;
  }
  return undiciFetch.bind(globalThis);
};

// Polyfill TextEncoder/TextDecoder for Node-based tests when absent.
if (typeof (globalThis as any).TextEncoder === "undefined" || typeof (globalThis as any).TextDecoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { TextEncoder, TextDecoder } = require("util");
  if (typeof (globalThis as any).TextEncoder === "undefined") {
    (globalThis as any).TextEncoder = TextEncoder;
  }
  if (typeof (globalThis as any).TextDecoder === "undefined") {
    (globalThis as any).TextDecoder = TextDecoder;
  }
}

if (typeof (globalThis as any).ReadableStream === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { ReadableStream, WritableStream, TransformStream } = require("stream/web");
  (globalThis as any).ReadableStream = ReadableStream;
  if (typeof (globalThis as any).WritableStream === "undefined") {
    (globalThis as any).WritableStream = WritableStream;
  }
  if (typeof (globalThis as any).TransformStream === "undefined") {
    (globalThis as any).TransformStream = TransformStream;
  }
}

if (typeof (globalThis as any).MessageChannel === "undefined") {
  type Listener = (event: { data: unknown }) => void;

  const schedule = typeof queueMicrotask === "function" ? queueMicrotask : (cb: () => void) => setTimeout(cb, 0);

  class MockMessagePort {
    private listeners = new Set<Listener>();
    private counterpart?: MockMessagePort;
    onmessage: Listener | null = null;

    constructor() {
      this.start = this.start.bind(this);
    }

    setCounterpart(port: MockMessagePort) {
      this.counterpart = port;
    }

    postMessage(data: unknown) {
      const target = this.counterpart;
      if (!target) {
        return;
      }
      const event = { data };
      schedule(() => {
        target.handleMessage(event);
      });
    }

    addEventListener(type: string, listener: Listener) {
      if (type === "message") {
        this.listeners.add(listener);
      }
    }

    removeEventListener(type: string, listener: Listener) {
      if (type === "message") {
        this.listeners.delete(listener);
      }
    }

    start() {
      // The polyfill eagerly delivers messages, so no-op here.
    }

    close() {
      this.listeners.clear();
      this.onmessage = null;
      this.counterpart = undefined;
    }

    ref() {
      // No-op to mirror Node's API surface.
    }

    unref() {
      // No-op to mirror Node's API surface.
    }

    private handleMessage(event: { data: unknown }) {
      this.onmessage?.(event);
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }

  class MockMessageChannel {
    port1: MockMessagePort;
    port2: MockMessagePort;

    constructor() {
      this.port1 = new MockMessagePort();
      this.port2 = new MockMessagePort();
      this.port1.setCounterpart(this.port2);
      this.port2.setCounterpart(this.port1);
    }
  }

  (globalThis as any).MessagePort = MockMessagePort;
  (globalThis as any).MessageChannel = MockMessageChannel;
}

if (typeof (globalThis as any).BroadcastChannel === "undefined") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { BroadcastChannel } = require("worker_threads");
    (globalThis as any).BroadcastChannel = BroadcastChannel;
  } catch {
    // ignore if not available; tests relying on BroadcastChannel will provide their own shim.
  }
}

const originalFetch: typeof fetch = resolveNativeFetch();
Object.defineProperty(globalThis, "__ORIGINAL_FETCH__", {
  value: originalFetch,
  configurable: true,
  writable: false,
});

// Default mock for fetch to avoid accidental network calls.
beforeEach(() => {
  if ((globalThis as any).__USE_REAL_FETCH__) {
    global.fetch = originalFetch;
  } else {
    global.fetch = jest.fn();
  }
});

afterEach(() => {
  jest.resetAllMocks();
  global.fetch = originalFetch;
  if ((globalThis as any).__USE_REAL_FETCH__) {
    delete (globalThis as any).__USE_REAL_FETCH__;
  }
});

export {};

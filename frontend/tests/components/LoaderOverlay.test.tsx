import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import LoaderOverlay from "../../components/layout/LoaderOverlay";

beforeAll(() => {
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "requestAnimationFrame", {
      value: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0),
      writable: true,
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      value: (handle: number) => clearTimeout(handle),
      writable: true,
    });
  }
});

describe("LoaderOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalOverflow: string;
  let originalPadding: string;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    originalOverflow = document.body.style.overflow;
    originalPadding = document.body.style.paddingRight;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    try {
      jest.runOnlyPendingTimers();
    } finally {
      jest.useRealTimers();
    }
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPadding;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("keeps the overlay visible for the minimum duration before hiding", () => {
    act(() => {
      root.render(<LoaderOverlay open message="読み込み中" minimumDuration={500} />);
    });

    let overlay = document.querySelector(".loader-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains("loader-overlay--visible")).toBe(true);

    act(() => {
      root.render(<LoaderOverlay open={false} message="読み込み中" minimumDuration={500} />);
    });

    overlay = document.querySelector(".loader-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains("loader-overlay--visible")).toBe(true);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    overlay = document.querySelector(".loader-overlay");
    expect(overlay).toBeNull();
  });

  it("locks and restores body scroll while visible", () => {
    act(() => {
      root.render(<LoaderOverlay open message="読み込み中" minimumDuration={0} />);
    });
    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      root.render(<LoaderOverlay open={false} message="読み込み中" minimumDuration={0} />);
    });

    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(document.body.style.overflow).toBe(originalOverflow ?? "");
    expect(document.body.style.paddingRight).toBe(originalPadding ?? "");
  });
});

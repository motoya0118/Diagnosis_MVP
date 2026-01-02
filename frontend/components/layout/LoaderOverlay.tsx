"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LoaderOverlayProps = {
  open: boolean;
  message: string;
  /**
   * 表示を保証する最小時間(ms)。ちらつきを抑えるために利用する。
   */
  minimumDuration?: number;
  /**
   * aria-live に渡す値。明示指定がない場合は polite を利用する。
   */
  ariaLive?: "polite" | "assertive" | "off";
};

const DEFAULT_MIN_DURATION = 300;

let activeLocks = 0;
let originalOverflow: string | null = null;
let originalPaddingRight: string | null = null;

const lockBodyScroll = () => {
  if (typeof document === "undefined") return;
  if (activeLocks === 0) {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
  }
  activeLocks += 1;
};

const unlockBodyScroll = () => {
  if (typeof document === "undefined") return;
  activeLocks = Math.max(0, activeLocks - 1);
  if (activeLocks === 0) {
    document.body.style.overflow = originalOverflow ?? "";
    document.body.style.paddingRight = originalPaddingRight ?? "";
    originalOverflow = null;
    originalPaddingRight = null;
  }
};

export default function LoaderOverlay({
  open,
  message,
  minimumDuration = DEFAULT_MIN_DURATION,
  ariaLive = "polite",
}: LoaderOverlayProps) {
  const [visible, setVisible] = useState(open);
  const [displayMessage, setDisplayMessage] = useState(message);
  const openedAtRef = useRef<number | null>(open ? Date.now() : null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDisplayMessage((current) => (open ? message : current));
  }, [open, message]);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (open) {
      openedAtRef.current = Date.now();
      setVisible(true);
      return;
    }

    if (openedAtRef.current === null) {
      setVisible(false);
      return;
    }

    const elapsed = Date.now() - openedAtRef.current;
    const remaining = Math.max(minimumDuration - elapsed, 0);
    if (remaining <= 0) {
      setVisible(false);
      openedAtRef.current = null;
      return;
    }

    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      openedAtRef.current = null;
      hideTimerRef.current = null;
    }, remaining);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [open, minimumDuration]);

  useEffect(() => {
    if (!visible) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [visible]);

  const statusProps = useMemo(() => {
    if (!visible) return {};
    return {
      role: "status" as const,
      "aria-live": ariaLive,
    };
  }, [visible, ariaLive]);

  if (!visible && !open) {
    return null;
  }

  return (
    <div className={`loader-overlay${visible ? " loader-overlay--visible" : ""}`}>
      <div className="loader-overlay__panel" ref={panelRef} tabIndex={-1}>
        <span className="loader-overlay__spinner" aria-hidden="true" />
        <p className="loader-overlay__message" {...statusProps}>
          {displayMessage}
        </p>
      </div>
    </div>
  );
}

const DEVICE_ID_COOKIE_MAX_AGE = Number(process.env.NEXT_PUBLIC_DEVICE_ID_COOKIE_MAX_AGE ?? 60 * 60 * 24 * 365);

export function ensureDeviceId(storageKey = 'device_id'): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      syncCookie(storageKey, existing);
      return existing;
    }
    const generated = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    window.localStorage.setItem(storageKey, generated);
    syncCookie(storageKey, generated);
    return generated;
  } catch {
    return undefined;
  }
}

function syncCookie(name: string, value: string) {
  try {
    if (typeof document === 'undefined') return;
    if (!document.cookie.includes(`${name}=`)) {
      document.cookie = `${name}=${value}; Path=/; Max-Age=${DEVICE_ID_COOKIE_MAX_AGE}; SameSite=Lax`;
    }
  } catch {
    // ignore cookie failures (cookie jar disabled)
  }
}

export function readDeviceId(storageKey = 'device_id'): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(storageKey) || undefined;
  } catch {
    return undefined;
  }
}

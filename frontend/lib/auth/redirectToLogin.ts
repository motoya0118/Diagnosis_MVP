export function redirectToLogin(fromPath?: string) {
  if (typeof window === "undefined") return;
  const target = "/login" + (fromPath ? `?next=${encodeURIComponent(fromPath)}` : "");
  window.location.assign(target);
}


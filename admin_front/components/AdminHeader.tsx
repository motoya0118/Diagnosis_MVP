"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./AdminHeader.module.css";

export type AdminHeaderMenuItem = {
  href: string;
  label: string;
  exact?: boolean;
};

export type AdminHeaderProps = {
  brand?: string;
  brandHref?: string;
  brandSubLabel?: string;
  menuItems?: AdminHeaderMenuItem[];
  onSignOut?: () => Promise<void> | void;
};

const DEFAULT_MENU: AdminHeaderMenuItem[] = [
  {
    href: "/dashboard",
    label: "ダッシュボード",
  },
];

function normalizePath(path: string): string {
  if (!path) return "/";
  const trimmed = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
  return trimmed || "/";
}

export default function AdminHeader({
  brand = "Avanti Admin",
  brandHref = "/dashboard",
  brandSubLabel = "Diagnostics Console",
  menuItems = DEFAULT_MENU,
  onSignOut,
}: AdminHeaderProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const items = useMemo(() => (menuItems.length > 0 ? menuItems : DEFAULT_MENU), [menuItems]);
  const normalizedPath = normalizePath(pathname ?? "/");

  useEffect(() => {
    setIsMenuOpen(false);
  }, [normalizedPath]);

  const isActive = useCallback(
    (href: string, exact = false) => {
      const normalizedHref = normalizePath(href);
      if (exact) {
        return normalizedPath === normalizedHref;
      }
      if (normalizedHref === "/") {
        return normalizedPath === "/";
      }
      return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
    },
    [normalizedPath],
  );

  const handleSignOut = useCallback(async () => {
    if (!onSignOut) return;
    setIsMenuOpen(false);
    setIsSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setIsSigningOut(false);
    }
  }, [onSignOut]);

  const hasSignOutAction = typeof onSignOut === "function";

  return (
    <header className={styles.root} data-open={isMenuOpen} suppressHydrationWarning>
      <div className={styles.inner}>
        <Link href={brandHref} className={styles.brandLink} aria-label={`${brand}トップへ`}>
          <span className={styles.brandMark}>{brand}</span>
          {brandSubLabel ? <span className={styles.brandSub}>{brandSubLabel}</span> : null}
        </Link>

        <button
          type="button"
          className={styles.toggle}
          aria-expanded={isMenuOpen}
          aria-controls="admin-global-nav"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          suppressHydrationWarning
        >
          <span className={styles.toggleIcon} aria-hidden="true">
            <span className={styles.toggleBar} />
          </span>
          <span className={styles.visuallyHidden}>
            {isMenuOpen ? "メニューを閉じる" : "メニューを開く"}
          </span>
        </button>

        <nav className={styles.nav} aria-label="管理メニュー">
          <ul className={styles.menu} id="admin-global-nav" data-open={isMenuOpen}>
            {items.map(({ href, label, exact }) => (
              <li key={href} className={styles.menuItem}>
                <Link
                  href={href}
                  className={styles.menuLink}
                  data-active={isActive(href, exact)}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {label}
                </Link>
              </li>
            ))}
            {hasSignOutAction ? (
              <li className={styles.menuItem}>
                <button
                  type="button"
                  className={styles.signOutButton}
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  suppressHydrationWarning
                >
                  {isSigningOut ? "ログアウト中..." : "ログアウト"}
                </button>
              </li>
            ) : null}
          </ul>
        </nav>
      </div>
    </header>
  );
}

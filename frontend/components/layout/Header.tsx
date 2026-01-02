"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "../../styles/Header.module.css";

const menuItems = [
  { href: "/", label: "TOP" },
  { href: "/diagnostics/ai_career", label: "ITキャリア診断" },
  { href: "/register", label: "会員登録" },
  { href: "/login", label: "ログイン" },
];

export default function Header() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  return (
    <header className={styles.root} data-open={isMenuOpen}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brandLink} aria-label="TOPへ">
          <span className={styles.brandMark}>Motoya</span>
        </Link>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={isMenuOpen}
          aria-controls="global-nav"
          onClick={() => setIsMenuOpen((prev) => !prev)}
        >
          <span className={styles.toggleIcon} aria-hidden="true">
            <span className={styles.toggleBar} />
          </span>
          <span className={styles.visuallyHidden}>
            {isMenuOpen ? "メニューを閉じる" : "メニューを開く"}
          </span>
        </button>
        <nav className={styles.nav} aria-label="メイン">
          <ul className={styles.menu} data-open={isMenuOpen} id="global-nav">
            {menuItems.map(({ href, label }) => (
              <li className={styles.menuItem} key={href}>
                <Link
                  className={styles.menuLink}
                  href={href}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SessionProvider, signOut } from "next-auth/react";
import type { Session } from "next-auth";

import AdminHeader, { type AdminHeaderMenuItem } from "../components/AdminHeader";

type HeaderConfig = {
  brand?: string;
  brandHref?: string;
  brandSubLabel?: string;
  menuItems?: AdminHeaderMenuItem[];
};

type AdminLayoutContextValue = {
  headerVisible: boolean;
  setHeaderVisible: (visible: boolean) => void;
  headerConfig: HeaderConfig;
  setHeaderConfig: (config: Partial<HeaderConfig>) => void;
  resetHeaderConfig: () => void;
};

const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  brand: "Avanti Admin",
  brandHref: "/dashboard",
  brandSubLabel: "Diagnostics Console",
};

const AdminLayoutContext = createContext<AdminLayoutContextValue | undefined>(undefined);

type AdminAppShellProps = {
  children: ReactNode;
  session: Session | null;
};

export function AdminAppShell({ children, session }: AdminAppShellProps) {
  const [headerVisible, setHeaderVisibleState] = useState(true);
  const [headerConfig, setHeaderConfigState] = useState<HeaderConfig>(DEFAULT_HEADER_CONFIG);

  const setHeaderVisible = useCallback((visible: boolean) => {
    setHeaderVisibleState(visible);
  }, []);

  const setHeaderConfig = useCallback((config: Partial<HeaderConfig>) => {
    setHeaderConfigState((prev) => ({ ...prev, ...config }));
  }, []);

  const resetHeaderConfig = useCallback(() => {
    setHeaderConfigState(DEFAULT_HEADER_CONFIG);
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut({ callbackUrl: "/" });
  }, []);

  const contextValue = useMemo<AdminLayoutContextValue>(
    () => ({
      headerVisible,
      setHeaderVisible,
      headerConfig,
      setHeaderConfig,
      resetHeaderConfig,
    }),
    [headerVisible, setHeaderVisible, headerConfig, setHeaderConfig, resetHeaderConfig],
  );

  return (
    <SessionProvider session={session}>
      <AdminLayoutContext.Provider value={contextValue}>
        <div className="admin-app-shell">
          {headerVisible ? (
            <AdminHeader
              brand={headerConfig.brand}
              brandHref={headerConfig.brandHref}
              brandSubLabel={headerConfig.brandSubLabel}
              menuItems={headerConfig.menuItems}
              onSignOut={handleSignOut}
            />
          ) : null}
          <main className="admin-main" data-header-visible={headerVisible ? "true" : "false"}>
            {children}
          </main>
        </div>
      </AdminLayoutContext.Provider>
    </SessionProvider>
  );
}

export function useAdminLayout(): AdminLayoutContextValue {
  const context = useContext(AdminLayoutContext);
  if (!context) {
    throw new Error("useAdminLayout must be used within AdminAppShell");
  }
  return context;
}

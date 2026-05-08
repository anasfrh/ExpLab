"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/AuthContext";

const NAV_ITEMS = [
  { href: "/", label: "Experiments" },
  { href: "/conversion-events", label: "Conversion Events" },
  { href: "/metrics", label: "Metrics" },
  { href: "/dimensions", label: "Dimensions" },
  { href: "/docs", label: "Documentation" },
  { href: "/power-calculator", label: "Power Calculator" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  if (pathname === "/login") {
    return <main>{children}</main>;
  }

  return (
    <div className="app-frame">
      <aside className="global-rail">
        <Link
          href="/settings"
          className={`rail-button ${pathname === "/settings" ? "active" : ""}`}
          aria-label="Settings"
          title="Settings"
        >
          👤
        </Link>
      </aside>

      <aside className="functional-sidebar">
        <div className="sidebar-site-picker">
          <div className="sidebar-site-label">ExpLab</div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={`sidebar-link ${pathname === item.href ? "active" : ""}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Global top-right Sign Out */}
      <button className="global-signout" onClick={logout} type="button">
        Sign Out
      </button>

      <main className="app-content">{children}</main>
    </div>
  );
}

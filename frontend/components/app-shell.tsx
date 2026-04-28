"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
const RAIL_ITEMS = [
  { label: "Profile", glyph: "A", href: "/" },
  { label: "Websites", glyph: "W", href: "/" },
  { label: "Data", glyph: "D", href: "/metrics" },
  { label: "Apps", glyph: "P", href: "/power-calculator" },
  { label: "Globe", glyph: "G", href: "/docs" },
  { label: "Theme", glyph: "M", href: "/" },
];

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

  return (
    <div className="app-frame">
      <aside className="global-rail">
        <div className="rail-stack">
          {RAIL_ITEMS.map((item) => (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              className={`rail-button ${pathname === item.href ? "active" : ""}`}
              aria-label={item.label}
              title={item.label}
            >
              {item.glyph}
            </Link>
          ))}
        </div>
      </aside>

      <aside className="functional-sidebar">
        <div className="sidebar-site-picker">
          <div className="sidebar-site-label">Website</div>
          <button className="site-picker-button" type="button">
            <span>experimentation-platform</span>
            <span className="site-picker-chevron">&gt;</span>
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={`sidebar-link ${pathname === item.href ? "active" : ""}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="app-content">{children}</main>
    </div>
  );
}

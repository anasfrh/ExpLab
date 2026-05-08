import "./globals.css";
import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { AuthProvider } from "../lib/AuthContext";

export const metadata: Metadata = {
  title: "Warehouse Native Experimentation",
  description: "Shared-store experimentation dashboard with simulation, stats, and health checks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}

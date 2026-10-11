import type { Metadata, Viewport } from "next";
import "../globals.css";

export const metadata: Metadata = { title: "Administrácia", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/**
 * Temporary admin (phase 2): password-protected by the proxy (ADMIN_USER /
 * ADMIN_PASSWORD). Phase 3 replaces it with accounts, roles and two-factor login.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="sk">
      <body>
        <div className="page admin">{children}</div>
      </body>
    </html>
  );
}

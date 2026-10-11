import type { Metadata, Viewport } from "next";
import "../globals.css";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/**
 * The admin: only for moderators and admins with two-factor login. Every page
 * checks the session itself (lib/auth/current.ts → requireStaffPage), and so
 * does every /api/admin route.
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

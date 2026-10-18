import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistration } from "@/components/admin/ServiceWorkerRegistration";

import "./admin-theme.css";

export const metadata: Metadata = {
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "VDF админка", statusBarStyle: "black" },
  icons: { apple: "/brand/admin-apple-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#1a2b20",
  viewportFit: "cover",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <ServiceWorkerRegistration />
      {children}
    </>
  );
}

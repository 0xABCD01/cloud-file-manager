import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CloudVault — Secure Cloud File Manager",
  description: "Upload, share, and manage files with enterprise-grade security.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

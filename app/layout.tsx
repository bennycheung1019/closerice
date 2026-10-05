import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Closerice · 食評筆記",
  description: "與朋友一齊記低每一餐的味道、相片和回憶。",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-HK">
      <body className="antialiased">{children}</body>
    </html>
  );
}

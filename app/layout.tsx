import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Closerice · 食評筆記",
  description: "一齊記低每一餐的味道、相片和回憶。",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg?v=2",
    shortcut: "/favicon.svg?v=2",
    apple: "/icon-180.png?v=2",
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

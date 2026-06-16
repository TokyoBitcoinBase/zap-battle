import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zap Battle",
  description: "Standalone Zap Battle display for WordPress iframe embeds."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

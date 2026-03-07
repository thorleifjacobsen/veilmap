import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VeilMap — Fog of War for Tabletop RPGs",
  description: "Self-hosted real-time Fog of War tool for tabletop RPG game masters",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

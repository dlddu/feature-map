import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FeatureMap",
  description: "AI-powered feature mapping for your codebase",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Responsible AI benchmark",
  description: "Bias, safety, and sycophancy scores for BBQ, BBG, WildGuard, and SYCON.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans antialiased">{children}</body>
    </html>
  );
}

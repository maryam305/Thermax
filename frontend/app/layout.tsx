import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThermaX | Urban heat intelligence",
  description: "Heat-safe routes, meeting planning, and urban cooling recommendations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

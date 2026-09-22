import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Manrope } from "next/font/google";
import "@/ui/styles/tokens.css";
import "@/ui/styles/global.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-manrope",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial"],
});

export const metadata: Metadata = {
  title: { default: "Finova", template: "%s | Finova" },
  description: "Finova: personal finance, market and news information, and informational investment ideas in one place.",
};

export const viewport: Viewport = {
  themeColor: "#020203",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}

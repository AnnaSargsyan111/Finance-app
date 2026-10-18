import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Manrope, Noto_Sans_Armenian } from "next/font/google";
import { LocaleProvider } from "@/ui/i18n/LocaleProvider";
import { getLocale } from "@/ui/i18n/server";
import { translate } from "@/ui/i18n/translate";
import "@/ui/styles/tokens.css";
import "@/ui/styles/global.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-manrope",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial"],
});

/** Manrope has no Armenian letters; this font covers them, so Armenian text is designed, not a random system font */
const armenian = Noto_Sans_Armenian({
  subsets: ["armenian"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-armenian",
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: "Finova", template: "%s | Finova" },
    description: translate(await getLocale(), "common.meta.description"),
  };
}

export const viewport: Viewport = {
  themeColor: "#020203",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${manrope.variable} ${armenian.variable}`}>
      <body>
        <LocaleProvider initial={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}

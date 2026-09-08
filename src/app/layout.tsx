import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const notoNastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "TCS Self-Service Kiosk — Prototype",
  description: "TCS self-service kiosk prototype.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${barlow.variable} ${notoNastaliq.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

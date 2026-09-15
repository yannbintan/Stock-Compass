import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Compass",
  description: "Clear stock signals, current context, practical risk sizing and market lessons in one dashboard.",
  openGraph: {
    title: "Stock Compass",
    description: "Clear signals. Current context. Smarter risk.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Stock Compass market dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock Compass",
    description: "Clear signals. Current context. Smarter risk.",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

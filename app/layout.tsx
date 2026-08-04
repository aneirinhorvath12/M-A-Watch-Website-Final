import type { Metadata } from "next";
import { SiteChrome } from "@/components/site/site-chrome";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://mawatch.org"),
  title: {
    default: "M&A Watch | Student-led deal intelligence",
    template: "%s | M&A Watch",
  },
  description:
    "Student-led analysis of landmark transactions across finance, law and global markets.",
  applicationName: "M&A Watch",
  keywords: [
    "mergers and acquisitions",
    "M&A research",
    "student finance society",
    "corporate law",
    "markets",
  ],
  authors: [{ name: "M&A Watch" }],
  creator: "M&A Watch",
  openGraph: {
    type: "website",
    siteName: "M&A Watch",
    title: "M&A Watch | Student-led deal intelligence",
    description:
      "Student-led analysis of landmark transactions across finance, law and global markets.",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "M&A Watch — Student-led deal intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "M&A Watch | Student-led deal intelligence",
    description:
      "Student-led analysis of landmark transactions across finance, law and global markets.",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/brand/logo-black-mark.png", type: "image/png" }],
    shortcut: "/brand/logo-black-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><SiteChrome>{children}</SiteChrome></body>
    </html>
  );
}

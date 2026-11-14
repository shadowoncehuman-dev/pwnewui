import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "ZXkai — Learning Platform",
  description:
    "ZXkai brings courses, lectures, notes, and learning resources together in one focused digital learning platform.",
  keywords: [
    "ZXkai",
    "study platform",
    "lectures",
    "notes",
    "JEE",
    "NEET",
    "batches",
    "video player",
  ],
  authors: [{ name: "ZXkai" }],
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "ZXkai — Learning Platform",
    description: "Premium batches, lectures and notes in one liquid-glass experience.",
    siteName: "ZXkai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZXkai",
    description: "Premium batches, lectures and notes in one liquid-glass experience.",
  },
};

export const viewport: Viewport = {
  themeColor: "#060a14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Loaded as a stylesheet: next/font/google fails under Turbopack builds. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      </head>
      <body
        className={`antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        <div className="sb-aurora" aria-hidden="true" />
        <div className="sb-grain" aria-hidden="true" />
        {children}
        <Toaster />
      </body>
    </html>
  );
}

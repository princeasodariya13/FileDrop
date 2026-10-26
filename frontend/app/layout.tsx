import { Inter, Outfit } from "next/font/google";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ScanButton } from "@/components/ui/ScanButton";
import { InstallAppButton } from "@/components/ui/InstallAppButton";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});


const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://file-drop-free.vercel.app";

export const viewport: Viewport = {
  themeColor: "#F1470C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FileDrop — Free Online File Transfer & Large File Sharing",
    template: "%s | FileDrop",
  },
  description:
    "FileDrop is a free online file sharing platform to send large files up to 10GB. Create secure file transfer links with temporary expiration and no signup required.",
  applicationName: "FileDrop",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/logo-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/logo-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FileDrop",
  },
  keywords: [
    "FileDrop",
    "file sharing",
    "online file transfer",
    "send large files",
    "free file sharing",
    "temporary file sharing link",
    "file transfer without signup",
    "pwa app",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "FileDrop — Free Online File Transfer & Large File Sharing",
    description:
      "FileDrop is a free online file sharing platform to send large files up to 10GB. Create secure file transfer links with temporary expiration and no signup required.",
    url: siteUrl,
    siteName: "FileDrop",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/logo.png",
        alt: "FileDrop Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "FileDrop — Free Online File Transfer & Large File Sharing",
    description:
      "FileDrop is a free online file sharing platform to send large files up to 10GB. Create secure file transfer links with temporary expiration and no signup required.",
    images: ["/logo.png"],
  },
  verification: {
    google: "jL2-mH0VIO0U4cOAVCRPIteZ1fjXh2YXo43r-kQ5NNg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/logo-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <Script
          id="filedrop-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var saved = localStorage.getItem("filedrop-theme");
                var isDark = false;
                if (saved === "dark") {
                  isDark = true;
                } else if (saved === "light") {
                  isDark = false;
                } else {
                  isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
                }
                if (!isDark) {
                  document.documentElement.classList.add("light");
                  document.documentElement.classList.remove("dark");
                } else {
                  document.documentElement.classList.remove("light");
                  document.documentElement.classList.add("dark");
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans bg-bg-base text-ink-50 selection:bg-brand-500/30">
        <header className="fixed top-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 rounded-full border border-border-color bg-bg-panel/80 backdrop-blur-xl shadow-xs transition-colors">
          <div className="mx-auto flex h-14 w-full items-center justify-between px-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 focus-ring rounded-lg group">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden shadow-md group-hover:scale-105 transition-transform">
                <Image src="/logo.png" alt="FileDrop Logo" width={36} height={36} priority className="object-cover scale-150" />
              </span>
              <span className="font-heading font-bold text-lg tracking-tight text-ink-50 group-hover:text-brand-500 transition-colors">FileDrop</span>
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <InstallAppButton />
              <ScanButton />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="flex-1 relative z-10">{children}</main>
        <footer className="border-t border-surface py-8 mt-auto relative z-10">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 text-sm text-ink-400 text-center flex flex-col items-center gap-2">
            <p>FileDrop free file sharing service — uploaded files automatically expire and delete.</p>
            <p className="text-xs text-ink-600">Secure File Transfer • No Registration • Up to 10GB</p>
          </div>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

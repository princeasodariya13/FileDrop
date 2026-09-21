import { Inter, Outfit } from "next/font/google";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FileDrop — Send Large Files, Simply",
    template: "%s | FileDrop",
  },
  description:
    "Upload and share large files with FileDrop. Send files up to 10GB using simple share links with automatic expiration.",
  applicationName: "FileDrop",
  keywords: [
    "file sharing",
    "send large files",
    "temporary file transfer",
    "free file upload",
    "file drop",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "FileDrop — Send Large Files, Simply",
    description:
      "Upload and share large files with FileDrop. Send files up to 10GB using simple share links with automatic expiration.",
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
    title: "FileDrop — Send Large Files, Simply",
    description:
      "Upload and share large files with FileDrop. Send files up to 10GB using simple share links with automatic expiration.",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let isLight = true;
                const saved = localStorage.getItem("filedrop-theme");
                if (saved === "dark") {
                  isLight = false;
                }
                if (isLight) {
                  document.documentElement.classList.add("light");
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans bg-bg-base text-ink-50 selection:bg-brand-500/30">
        <header className="sticky top-0 z-50 bg-bg-base/60 backdrop-blur-xl border-b border-surface">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 focus-ring rounded-lg group">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-shadow">
                <Image src="/logo.png" alt="FileDrop Logo" width={36} height={36} priority className="object-cover scale-150" />
              </span>
              <span className="font-heading font-semibold text-xl tracking-tight text-ink-50 group-hover:text-brand-500 transition-colors">FileDrop</span>
            </Link>

            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 relative z-10">{children}</main>
        <footer className="border-t border-surface py-8 mt-auto relative z-10">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 text-sm text-ink-400 text-center flex flex-col items-center gap-2">
            <p>Files are automatically deleted after they expire.</p>
            <p className="text-xs text-ink-600">Secure • Fast • Simple</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

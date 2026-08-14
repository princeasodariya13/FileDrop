import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "FileDrop — Send large files, simply",
  description:
    "Upload a file, get a link, share it. Files up to 10GB with automatic expiration.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let isLight = false;
                const saved = localStorage.getItem("filedrop-theme");
                if (saved === "light") {
                  isLight = true;
                } else if (!saved && window.matchMedia("(prefers-color-scheme: light)").matches) {
                  isLight = true;
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
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-btn-primary text-white shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-shadow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <polyline points="9 15 12 18 15 15" />
                </svg>
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

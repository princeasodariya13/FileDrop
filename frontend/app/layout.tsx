import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen flex flex-col font-sans bg-bg-base text-ink-50 selection:bg-brand-500/30">
        <header className="sticky top-0 z-50 bg-bg-base/60 backdrop-blur-xl border-b border-white/5">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 focus-ring rounded-lg group">
              <Image 
                src="/logo.jpeg" 
                alt="FileDrop Logo" 
                width={36} 
                height={36} 
                className="rounded-xl shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-shadow object-cover" 
              />
              <span className="font-heading font-semibold text-xl tracking-tight text-white group-hover:text-brand-50 transition-colors">FileDrop</span>
            </Link>
          </div>
        </header>
        <main className="flex-1 relative z-10">{children}</main>
        <footer className="border-t border-white/5 py-8 mt-auto relative z-10">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 text-sm text-ink-400 text-center flex flex-col items-center gap-2">
            <p>Files are automatically deleted after they expire.</p>
            <p className="text-xs text-ink-600">Secure • Fast • Simple</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

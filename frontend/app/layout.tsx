import type { Metadata } from "next";
import Link from "next/link";
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
      <body className="min-h-screen flex flex-col font-sans">
        <header className="border-b border-ink-100 bg-white">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 focus-ring rounded">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] bg-brand-500 text-white text-sm font-semibold">
                F
              </span>
              <span className="font-semibold text-ink-900">FileDrop</span>
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-ink-100 py-6">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 text-sm text-ink-400">
            Files are automatically deleted after they expire.
          </div>
        </footer>
      </body>
    </html>
  );
}

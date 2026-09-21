import type { Metadata } from "next";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { ToastProvider } from "@/components/ui/Toast";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://file-drop-free.vercel.app";

export const metadata: Metadata = {
  title: "FileDrop — Send Large Files, Simply",
  description:
    "Upload and share large files with FileDrop. Send files up to 10GB using simple share links with automatic expiration.",
  alternates: {
    canonical: "/",
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
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "FileDrop",
  url: `${siteUrl}/`,
  description:
    "Upload and share large files with FileDrop. Send files up to 10GB using simple share links with automatic expiration.",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "All",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16 lg:py-24 animate-fade-in-scale">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-10 text-center">
        <h1 className="text-4xl md:text-5xl font-bold font-heading text-ink-50 tracking-tight">
          Send large files, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-accent-400">simply</span>
        </h1>
        <p className="mt-4 text-base text-ink-300 max-w-lg mx-auto leading-relaxed">
          Drop a file, choose when it expires, share the link. Secure, fast, and up to 10GB.
        </p>
      </div>
      <ToastProvider>
        <UploadFlow />
      </ToastProvider>

      {/* Supporting Crawlable SEO Section */}
      <section className="mt-16 pt-10 border-t border-surface grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div className="p-4 space-y-2 rounded-2xl bg-surface/40 border border-surface-hover">
          <h2 className="text-sm font-semibold text-ink-50 font-heading">Large File Sharing</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Upload single or multiple files up to 10GB with fast chunked transfers and no signup required.
          </p>
        </div>

        <div className="p-4 space-y-2 rounded-2xl bg-surface/40 border border-surface-hover">
          <h2 className="text-sm font-semibold text-ink-50 font-heading">Automatic Expiration</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Files automatically expire and permanently delete after your selected timer to keep shared data temporary.
          </p>
        </div>

        <div className="p-4 space-y-2 rounded-2xl bg-surface/40 border border-surface-hover">
          <h2 className="text-sm font-semibold text-ink-50 font-heading">Links &amp; 6-Digit Codes</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Share direct download links or a simple 6-digit transfer code for receivers to retrieve files on any device.
          </p>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { ToastProvider } from "@/components/ui/Toast";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://file-drop-free.vercel.app";

export const metadata: Metadata = {
  title: "FileDrop — Free Online File Transfer & Large File Sharing",
  description:
    "FileDrop is a free online file sharing platform to send large files online up to 10GB. Create a secure file sharing link with automatic expiration and no signup required.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "FileDrop — Free Online File Transfer & Large File Sharing",
    description:
      "FileDrop is a free online file sharing platform to send large files online up to 10GB. Create a secure file sharing link with automatic expiration and no signup required.",
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
      "FileDrop is a free online file sharing platform to send large files online up to 10GB. Create a secure file sharing link with automatic expiration and no signup required.",
    images: ["/logo.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "FileDrop",
  url: `${siteUrl}/`,
  description:
    "Free online file sharing and temporary file transfer platform to send large files online up to 10GB without signup.",
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
          Free online file sharing <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-accent-400">made simple</span>
        </h1>
        <p className="mt-4 text-base text-ink-300 max-w-xl mx-auto leading-relaxed">
          Upload and transfer large files online up to 10GB with FileDrop. Create temporary file sharing links with instant expiration and no registration required.
        </p>
      </div>
      <ToastProvider>
        <UploadFlow />
      </ToastProvider>

      {/* Supporting Crawlable SEO Section */}
      <section className="mt-16 pt-10 border-t border-surface grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div className="p-4 space-y-2 rounded-2xl bg-surface/40 border border-surface-hover">
          <h2 className="text-sm font-semibold text-ink-50 font-heading">Large File Transfer</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Upload and send large files up to 10GB using our fast online file transfer tool with zero file sharing registration.
          </p>
        </div>

        <div className="p-4 space-y-2 rounded-2xl bg-surface/40 border border-surface-hover">
          <h2 className="text-sm font-semibold text-ink-50 font-heading">Temporary File Sharing</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Set your preferred timer for temporary file upload. Shared files automatically expire and get removed permanently.
          </p>
        </div>

        <div className="p-4 space-y-2 rounded-2xl bg-surface/40 border border-surface-hover">
          <h2 className="text-sm font-semibold text-ink-50 font-heading">Instant Share Links &amp; Codes</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Create a secure file sharing link or a 6-digit code to share files online quickly across any browser or device.
          </p>
        </div>
      </section>
    </div>
  );
}

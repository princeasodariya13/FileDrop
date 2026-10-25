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
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: "FileDrop",
      alternateName: ["File Drop", "FileDrop Free"],
      publisher: {
        "@type": "Organization",
        name: "FileDrop",
        url: `${siteUrl}/`,
        logo: `${siteUrl}/logo.png`,
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
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
    },
  ],
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-28 sm:pt-36 pb-16 lg:pb-24 animate-fade-in-scale">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-10 text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-surface-hover bg-surface/80 px-3.5 py-1 text-xs font-medium text-ink-300 backdrop-blur-md shadow-xs">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
          No uploads wait · Up to 10GB · Instant transfer
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold font-heading text-ink-50 tracking-tight leading-[1.1]">
          Send huge files, <span className="text-brand-500">instantly.</span>
        </h1>
        <p className="text-sm sm:text-base text-ink-400 max-w-2xl mx-auto leading-relaxed">
          Upload and transfer large files online up to 10GB with FileDrop. Create temporary file sharing links with instant expiration and no registration required.
        </p>
      </div>
      <ToastProvider>
        <UploadFlow />
      </ToastProvider>

      {/* Supporting Crawlable SEO Section */}
      <section className="mt-20 pt-10 border-t border-border-color grid grid-cols-1 sm:grid-cols-3 gap-5 text-center">
        <div className="p-5 space-y-2 rounded-3xl bg-surface/40 border border-surface-hover backdrop-blur-sm transition-all hover:border-brand-500/30 hover:bg-surface/60">
          <h2 className="text-sm font-bold text-ink-50 font-heading">Large File Transfer</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Upload and send large files up to 10GB using our fast online file transfer tool with zero file sharing registration.
          </p>
        </div>

        <div className="p-5 space-y-2 rounded-3xl bg-surface/40 border border-surface-hover backdrop-blur-sm transition-all hover:border-brand-500/30 hover:bg-surface/60">
          <h2 className="text-sm font-bold text-ink-50 font-heading">Temporary File Sharing</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Set your preferred timer for temporary file upload. Shared files automatically expire and get removed permanently.
          </p>
        </div>

        <div className="p-5 space-y-2 rounded-3xl bg-surface/40 border border-surface-hover backdrop-blur-sm transition-all hover:border-brand-500/30 hover:bg-surface/60">
          <h2 className="text-sm font-bold text-ink-50 font-heading">Instant Share Links &amp; Codes</h2>
          <p className="text-xs text-ink-400 leading-relaxed">
            Create a secure file sharing link or a 6-digit code to share files online quickly across any browser or device.
          </p>
        </div>
      </section>
    </div>
  );
}

import { UploadFlow } from "@/components/upload/UploadFlow";
import { ToastProvider } from "@/components/ui/Toast";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16 lg:py-24 animate-fade-in-scale">
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
    </div>
  );
}

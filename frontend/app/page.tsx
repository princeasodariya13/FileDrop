import { UploadFlow } from "@/components/upload/UploadFlow";
import { ToastProvider } from "@/components/ui/Toast";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-ink-900">Send large files, simply</h1>
        <p className="mt-2 text-sm text-ink-400">
          Drop a file, choose when it expires, share the link. Up to 10GB.
        </p>
      </div>
      <ToastProvider>
        <UploadFlow />
      </ToastProvider>
    </div>
  );
}

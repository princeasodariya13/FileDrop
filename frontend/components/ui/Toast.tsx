"use client";

import { createContext, useCallback, useContext, useState } from "react";
import clsx from "clsx";

interface Toast {
  id: number;
  message: string;
  tone: "error" | "success" | "info";
}

const ToastContext = createContext<{ push: (message: string, tone?: Toast["tone"]) => void } | null>(
  null
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[999999] flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs sm:text-sm font-medium shadow-2xl backdrop-blur-md transition-all animate-fade-in-scale",
              // Info Tone (Adaptive: clean contrast in both light and dark)
              t.tone === "info" &&
                "bg-panel/95 border-surface-hover text-ink-50 shadow-black/10 dark:shadow-black/50",
              // Success Tone (Rich green text in light mode, bright mint in dark mode)
              t.tone === "success" &&
                "bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/30 text-emerald-800 dark:text-emerald-200 shadow-emerald-500/10",
              // Error Tone (Rich red text in light mode, bright coral in dark mode)
              t.tone === "error" &&
                "bg-red-500/10 dark:bg-red-500/20 border-red-500/30 text-red-800 dark:text-red-200 shadow-red-500/10"
            )}
          >
            {t.tone === "success" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-emerald-600 dark:text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {t.tone === "error" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-600 dark:text-red-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            {t.tone === "info" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand-600 dark:text-brand-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            )}
            <span className="flex-1 font-medium leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: (message: string, tone?: Toast["tone"]) => {
        console.log(`[Toast ${tone || "info"}]: ${message}`);
      },
    };
  }
  return ctx;
}

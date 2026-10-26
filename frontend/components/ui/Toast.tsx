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

  const removeToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[999999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "pointer-events-auto flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium transition-all animate-fade-in-scale",
              t.tone === "success" && "toast-card-success",
              t.tone === "error" && "toast-card-error",
              t.tone === "info" && "toast-card-info"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {t.tone === "success" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl toast-icon-bg-success">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="toast-icon-success"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
              {t.tone === "error" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl toast-icon-bg-error">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="toast-icon-error"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
              )}
              {t.tone === "info" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl toast-icon-bg-info">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="toast-icon-info"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
              )}
              <span className="flex-1 font-semibold leading-snug break-words">{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              title="Close notification"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
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

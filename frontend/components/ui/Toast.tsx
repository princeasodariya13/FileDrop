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
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "rounded-card border px-4 py-3 text-sm shadow-md bg-white",
              t.tone === "error" && "border-red-200 text-red-700",
              t.tone === "success" && "border-emerald-200 text-emerald-700",
              t.tone === "info" && "border-ink-100 text-ink-900"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

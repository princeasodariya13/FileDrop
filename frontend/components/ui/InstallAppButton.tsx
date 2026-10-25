"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker for PWA & offline support
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("FileDrop SW registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("SW registration error:", err);
        });
    }

    // 2. Check if already running in standalone mode (installed)
    const isRunningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isRunningStandalone);

    // 3. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isIosDevice);

    // 4. Capture PWA beforeinstallprompt on Chromium browsers (Android/Chrome/Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // 5. Detect app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setIsModalOpen(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // If we have native deferredPrompt (Chrome, Edge, Android)
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsInstalled(true);
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.warn("Error prompting install:", err);
        setIsModalOpen(true);
      }
      return;
    }

    // If iOS or deferredPrompt is not available, show the interactive guide modal
    setIsModalOpen(true);
  };

  // If already running standalone inside the installed app, show minimal badge or hide
  if (isStandalone || isInstalled) {
    return (
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="focus-ring inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 px-2.5 sm:px-3 rounded-full bg-surface border border-emerald-500/30 text-emerald-400 hover:bg-surface-hover transition-all text-xs font-medium"
        title="FileDrop App Installed"
        aria-label="App Installed"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-400"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span className="text-xs font-semibold font-heading hidden sm:inline">
          App Ready
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="focus-ring inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 px-3 sm:px-3.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500 hover:text-white transition-all hover:scale-105 active:scale-95 text-xs font-medium shadow-xs"
        title="Download FileDrop as Mobile App"
        aria-label="Download App"
      >
        {/* Modern App Download / Install Icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          {/* Arrow pointing down into tray / device */}
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>

        <span className="text-xs font-semibold font-heading">
          Download
          <span className="hidden min-[400px]:inline">&nbsp;App</span>
        </span>
      </button>

      {/* Guide & Installation Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-bg-panel border border-border-color p-6 shadow-2xl relative text-ink-50 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-ink-400 hover:text-ink-50 rounded-full hover:bg-surface transition-colors"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 shrink-0">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                  <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-heading font-bold text-ink-50 tracking-tight">
                  Download FileDrop App
                </h3>
                <p className="text-xs text-ink-400">
                  Fast access, offline-ready & no app store needed
                </p>
              </div>
            </div>

            {/* App Benefits Badges */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="p-2.5 rounded-xl bg-surface/70 border border-surface-hover text-center">
                <span className="block text-brand-400 font-bold text-xs">⚡ Fast</span>
                <span className="text-[10px] text-ink-400">Instant launch</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface/70 border border-surface-hover text-center">
                <span className="block text-emerald-400 font-bold text-xs">📶 Offline</span>
                <span className="text-[10px] text-ink-400">Cached shell</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface/70 border border-surface-hover text-center">
                <span className="block text-blue-400 font-bold text-xs">🔒 0MB</span>
                <span className="text-[10px] text-ink-400">Lightweight</span>
              </div>
            </div>

            {/* Instruction body depending on device */}
            {isIOS ? (
              /* iOS Safari instructions */
              <div className="space-y-3.5 mb-6">
                <div className="text-xs font-semibold text-ink-300 uppercase tracking-wider">
                  How to install on iPhone / iPad:
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-surface border border-surface-hover">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="text-xs text-ink-200 leading-relaxed">
                    Tap the <span className="font-semibold text-ink-50">Share</span> icon in Safari at the bottom bar:
                    <span className="inline-flex items-center align-middle mx-1.5 p-1 rounded bg-bg-base border border-surface-hover text-brand-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-surface border border-surface-hover">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="text-xs text-ink-200 leading-relaxed">
                    Scroll down and tap <span className="font-semibold text-ink-50">&quot;Add to Home Screen&quot;</span>:
                    <span className="inline-flex items-center align-middle mx-1.5 p-1 rounded bg-bg-base border border-surface-hover text-brand-400">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-surface border border-surface-hover">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="text-xs text-ink-200 leading-relaxed">
                    Tap <span className="font-semibold text-ink-50">&quot;Add&quot;</span> in the top right corner. FileDrop will now appear as a native app icon on your home screen!
                  </div>
                </div>
              </div>
            ) : (
              /* Android & Desktop instructions */
              <div className="space-y-3.5 mb-6">
                {deferredPrompt ? (
                  <div className="p-3 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-center">
                    <p className="text-xs text-brand-300 font-medium mb-3">
                      Your browser is ready to install FileDrop directly!
                    </p>
                    <button
                      onClick={handleInstallClick}
                      className="w-full py-2.5 px-4 rounded-full bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs tracking-wide transition-all shadow-md active:scale-95"
                    >
                      Click Here to Install Now
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-semibold text-ink-300 uppercase tracking-wider">
                      Quick Install Steps:
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-surface border border-surface-hover">
                      <div className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        1
                      </div>
                      <div className="text-xs text-ink-200 leading-relaxed">
                        Tap the browser menu <span className="font-semibold text-ink-50">⋮ (three dots)</span> at the top or bottom right corner.
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-surface border border-surface-hover">
                      <div className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        2
                      </div>
                      <div className="text-xs text-ink-200 leading-relaxed">
                        Select <span className="font-semibold text-ink-50">&quot;Install App&quot;</span> or <span className="font-semibold text-ink-50">&quot;Add to Home Screen&quot;</span>.
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-surface border border-surface-hover">
                      <div className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        3
                      </div>
                      <div className="text-xs text-ink-200 leading-relaxed">
                        Confirm installation. FileDrop will launch in its own full-screen window like any native mobile app!
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Footer action */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-full py-2.5 px-5 rounded-full bg-surface hover:bg-surface-hover text-ink-200 hover:text-ink-50 font-medium text-xs transition-colors border border-surface-hover"
              >
                Got it, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

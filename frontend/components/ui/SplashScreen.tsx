"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Prevent body scrolling during splash animation
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Timing:
    // 0 - 1100ms: Smooth entrance, breathing glow, and logo presentation
    // 1100ms: Start fade-out / lift transition
    // 1450ms: Complete transition and remove from DOM
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 1150);

    const removeTimer = setTimeout(() => {
      setIsRemoved(true);
      document.body.style.overflow = originalOverflow;
    }, 1500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (isRemoved) {
    return null;
  }

  return (
    <aside
      aria-label="Loading FileDrop"
      aria-hidden={isRemoved}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0B0B0D] transition-all duration-400 ease-out select-none pointer-events-none ${
        isFadingOut
          ? "opacity-0 scale-[1.03] -translate-y-2"
          : "opacity-100 scale-100 translate-y-0"
      }`}
      style={{
        height: "100dvh",
        width: "100vw",
        background:
          "radial-gradient(circle at 50% 45%, rgba(241, 71, 12, 0.14) 0%, rgba(14, 14, 18, 0.95) 55%, #0B0B0D 100%)",
      }}
    >
      <div className="relative flex flex-col items-center justify-center">
        {/* Ambient Pulse Glow Behind Logo */}
        <div
          className="absolute -inset-4 rounded-full bg-brand-500/20 blur-2xl animate-pulse"
          style={{ animationDuration: "1.4s" }}
        />

        {/* Animated Brand Logo Icon Container */}
        <div
          className={`relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-surface/60 border border-surface-hover/80 shadow-2xl backdrop-blur-xl transition-all duration-700 ease-out transform ${
            mounted
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-75 translate-y-3"
          }`}
        >
          {/* Subtle Outer Glow Border */}
          <div className="absolute inset-0 rounded-3xl border border-brand-500/30 animate-pulse pointer-events-none" />

          {/* Clean High-Resolution FileDrop Logo */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
            <Image
              src="/logo-512.png"
              alt="FileDrop Logo"
              width={80}
              height={80}
              priority
              className="object-contain drop-shadow-[0_4px_16px_rgba(241,71,12,0.35)]"
            />
          </div>
        </div>

        {/* Brand Name & Tagline */}
        <div
          className={`mt-5 text-center transition-all duration-700 delay-150 ease-out transform ${
            mounted
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-90 translate-y-2"
          }`}
        >
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight text-white flex items-center justify-center gap-1">
            File<span className="text-brand-500">Drop</span>
          </h1>
          <p className="text-xs text-ink-400 mt-1 font-medium tracking-wide">
            Fast · Free · Secure File Sharing
          </p>
        </div>

        {/* Sleek Indeterminate Progress Shimmer Line */}
        <div
          className={`mt-6 w-32 h-[3px] rounded-full bg-surface-hover/60 overflow-hidden relative transition-opacity duration-500 delay-200 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-brand-500 to-transparent rounded-full animate-shimmer"
            style={{
              animation: "splashShimmer 1.2s infinite ease-in-out",
            }}
          />
        </div>
      </div>

      {/* Inline Keyframe for Shimmer Animation */}
      <style jsx global>{`
        @keyframes splashShimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(250%);
          }
        }
      `}</style>
    </aside>
  );
}

"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("filedrop-theme");
    let isDark = false;

    if (saved === "dark") {
      isDark = true;
    } else if (saved === "light") {
      isDark = false;
    } else {
      // First time opening app: detect user's device/system theme
      isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    const currentTheme = isDark ? "dark" : "light";
    setTheme(currentTheme);
    document.documentElement.classList.toggle("light", !isDark);

    // Update meta theme-color for mobile status bar
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", isDark ? "#0B0B0D" : "#FAF9F6");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("filedrop-theme", newTheme);
    document.documentElement.classList.toggle("light", newTheme === "light");

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", newTheme === "dark" ? "#0B0B0D" : "#FAF9F6");
    }
  };

  // Prevent hydration mismatch by not rendering the icon until mounted
  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  return (
    <button
      onClick={toggleTheme}
      className="focus-ring inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-surface border border-surface-hover text-ink-300 hover:bg-surface-hover hover:text-brand-500 transition-colors"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

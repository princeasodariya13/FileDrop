"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

const variantClasses: Record<string, string> = {
  primary:
    "bg-btn-primary text-white font-semibold shadow-md shadow-brand-500/20 hover:shadow-brand-500/30 disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none disabled:transform-none",
  secondary:
    "bg-surface text-ink-50 border border-surface-hover hover:bg-surface-hover backdrop-blur-md font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  ghost:
    "bg-transparent text-ink-300 hover:text-ink-50 hover:bg-surface font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
  danger:
    "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
};

const sizeClasses: Record<string, string> = {
  sm: "h-9 px-4 text-sm font-semibold rounded-xl",
  md: "h-11 px-6 text-sm font-semibold rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-card font-medium transition-colors disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";

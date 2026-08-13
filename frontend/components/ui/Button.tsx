"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

const variantClasses: Record<string, string> = {
  primary: "bg-btn-primary text-white disabled:opacity-50 disabled:bg-none disabled:bg-ink-800 disabled:text-ink-400 disabled:shadow-none",
  secondary: "bg-white/5 text-ink-50 border border-white/10 hover:bg-white/10 backdrop-blur-md",
  ghost: "bg-transparent text-ink-300 hover:text-white hover:bg-white/5",
  danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
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

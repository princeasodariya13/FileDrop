"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

const variantClasses: Record<string, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-ink-100 disabled:text-ink-400",
  secondary: "bg-white text-ink-900 border border-ink-100 hover:bg-ink-50",
  ghost: "bg-transparent text-ink-600 hover:bg-ink-100",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};

const sizeClasses: Record<string, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
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

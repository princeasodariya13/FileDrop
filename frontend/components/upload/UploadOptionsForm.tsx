"use client";

import { UploadOptions } from "@/types/upload";

const EXPIRATION_CHOICES = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
];

const DOWNLOAD_LIMIT_CHOICES = [
  { label: "Unlimited", value: null },
  { label: "1 download", value: 1 },
  { label: "5 downloads", value: 5 },
];

interface Props {
  value: UploadOptions;
  onChange: (value: UploadOptions) => void;
  disabled?: boolean;
}

export function UploadOptionsForm({ value, onChange, disabled }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <fieldset disabled={disabled}>
        <legend className="text-xs font-semibold text-ink-300 mb-2 uppercase tracking-wider">Expires in</legend>
        <div className="flex gap-2 flex-wrap">
          {EXPIRATION_CHOICES.map((choice) => (
            <button
              key={choice.hours}
              type="button"
              aria-pressed={value.expirationHours === choice.hours}
              onClick={() => onChange({ ...value, expirationHours: choice.hours })}
              className={`focus-ring rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                value.expirationHours === choice.hours
                  ? "border-accent-400 bg-brand-500/20 text-accent-100 shadow-[0_0_15px_rgba(168,85,247,0.15)] scale-[1.02]"
                  : "border-white/10 bg-white/5 text-ink-300 hover:border-brand-400/50 hover:bg-white/10 hover:text-ink-100"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="text-xs font-semibold text-ink-300 mb-2 uppercase tracking-wider">Download limit</legend>
        <div className="flex gap-2 flex-wrap">
          {DOWNLOAD_LIMIT_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              aria-pressed={value.downloadLimit === choice.value}
              onClick={() => onChange({ ...value, downloadLimit: choice.value })}
              className={`focus-ring rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                value.downloadLimit === choice.value
                  ? "border-accent-400 bg-brand-500/20 text-accent-100 shadow-[0_0_15px_rgba(168,85,247,0.15)] scale-[1.02]"
                  : "border-white/10 bg-white/5 text-ink-300 hover:border-brand-400/50 hover:bg-white/10 hover:text-ink-100"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

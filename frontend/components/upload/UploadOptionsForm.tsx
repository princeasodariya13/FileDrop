"use client";

import { UploadOptions } from "@/types/upload";

const EXPIRATION_CHOICES = [
  { label: "1 minute", value: 60 },
  { label: "15 minutes", value: 900 },
  { label: "30 minutes", value: 1800 },
  { label: "45 minutes", value: 2700 },
  { label: "1 hour", value: 3600 },
  { label: "2 hours", value: 7200 },
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
              key={choice.value}
              type="button"
              aria-pressed={value.expirationSeconds === choice.value}
              onClick={() => onChange({ ...value, expirationSeconds: choice.value })}
              className={`focus-ring rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                value.expirationSeconds === choice.value
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

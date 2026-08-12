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
        <legend className="text-xs font-medium text-ink-600 mb-1.5">Expires in</legend>
        <div className="flex gap-2 flex-wrap">
          {EXPIRATION_CHOICES.map((choice) => (
            <button
              key={choice.hours}
              type="button"
              aria-pressed={value.expirationHours === choice.hours}
              onClick={() => onChange({ ...value, expirationHours: choice.hours })}
              className={`focus-ring rounded-card border px-3 py-1.5 text-sm transition-colors ${
                value.expirationHours === choice.hours
                  ? "border-brand-500 bg-brand-50 text-brand-600"
                  : "border-ink-100 bg-white text-ink-600 hover:border-brand-400"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="text-xs font-medium text-ink-600 mb-1.5">Download limit</legend>
        <div className="flex gap-2 flex-wrap">
          {DOWNLOAD_LIMIT_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              aria-pressed={value.downloadLimit === choice.value}
              onClick={() => onChange({ ...value, downloadLimit: choice.value })}
              className={`focus-ring rounded-card border px-3 py-1.5 text-sm transition-colors ${
                value.downloadLimit === choice.value
                  ? "border-brand-500 bg-brand-50 text-brand-600"
                  : "border-ink-100 bg-white text-ink-600 hover:border-brand-400"
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

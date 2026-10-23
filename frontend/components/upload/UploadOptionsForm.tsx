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
        <legend className="text-xs font-semibold text-ink-400 mb-2 uppercase tracking-wider font-mono">Expires in</legend>
        <div className="flex gap-2 flex-wrap">
          {EXPIRATION_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              aria-pressed={value.expirationSeconds === choice.value}
              onClick={() => onChange({ ...value, expirationSeconds: choice.value })}
              className={`focus-ring rounded-full border px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                value.expirationSeconds === choice.value
                  ? "border-brand-500 bg-brand-500 text-white shadow-xs"
                  : "border-surface-hover bg-surface/70 text-ink-400 hover:text-ink-50 hover:bg-surface"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="text-xs font-semibold text-ink-400 mb-2 uppercase tracking-wider font-mono">Download limit</legend>
        <div className="flex flex-col gap-2.5">
          <div className="flex gap-2 flex-wrap">
            {DOWNLOAD_LIMIT_CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                aria-pressed={value.downloadLimit === choice.value}
                onClick={() => onChange({ ...value, downloadLimit: choice.value })}
                className={`focus-ring rounded-full border px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                  value.downloadLimit === choice.value
                    ? "border-brand-500 bg-brand-500 text-white shadow-xs"
                    : "border-surface-hover bg-surface/70 text-ink-400 hover:text-ink-50 hover:bg-surface"
                }`}
              >
                {choice.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={value.downloadLimit !== null && value.downloadLimit !== 1 && value.downloadLimit !== 5}
              onClick={() => onChange({ ...value, downloadLimit: 10 })}
              className={`focus-ring rounded-full border px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                value.downloadLimit !== null && value.downloadLimit !== 1 && value.downloadLimit !== 5
                  ? "border-brand-500 bg-brand-500 text-white shadow-xs"
                  : "border-surface-hover bg-surface/70 text-ink-400 hover:text-ink-50 hover:bg-surface"
              }`}
            >
              Custom
            </button>
          </div>
          {value.downloadLimit !== null && value.downloadLimit !== 1 && value.downloadLimit !== 5 && (
            <div className="flex items-center gap-2 animate-fade-in-scale">
              <input
                type="number"
                min="1"
                max="1000"
                value={value.downloadLimit || ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChange({ ...value, downloadLimit: isNaN(val) ? 10 : Math.max(1, Math.min(1000, val)) });
                }}
                className="focus-ring w-24 rounded-full border border-surface-hover bg-surface px-3 py-1.5 text-xs font-medium text-ink-100 outline-none transition-colors focus:border-brand-500"
              />
              <span className="text-xs text-ink-400 font-mono">downloads</span>
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}

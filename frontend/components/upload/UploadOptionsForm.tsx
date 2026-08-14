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
  { label: "1 system", value: 1 },
  { label: "5 systems", value: 5 },
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
                  : "border-surface-hover bg-surface text-ink-300 hover:border-brand-400/50 hover:bg-surface-hover hover:text-ink-100"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="text-xs font-semibold text-ink-300 mb-2 uppercase tracking-wider">Download limit</legend>
        <div className="flex flex-col gap-3">
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
                    : "border-surface-hover bg-surface text-ink-300 hover:border-brand-400/50 hover:bg-surface-hover hover:text-ink-100"
                }`}
              >
                {choice.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={value.downloadLimit !== null && value.downloadLimit !== 1 && value.downloadLimit !== 5}
              onClick={() => onChange({ ...value, downloadLimit: 10 })}
              className={`focus-ring rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                value.downloadLimit !== null && value.downloadLimit !== 1 && value.downloadLimit !== 5
                  ? "border-accent-400 bg-brand-500/20 text-accent-100 shadow-[0_0_15px_rgba(168,85,247,0.15)] scale-[1.02]"
                  : "border-surface-hover bg-surface text-ink-300 hover:border-brand-400/50 hover:bg-surface-hover hover:text-ink-100"
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
                className="focus-ring w-24 rounded-xl border border-surface-hover bg-surface px-3 py-1.5 text-sm font-medium text-ink-100 outline-none transition-colors focus:border-brand-400 focus:bg-surface-hover"
              />
              <span className="text-sm text-ink-400">systems</span>
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}

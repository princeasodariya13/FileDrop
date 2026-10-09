"use client";

export function ConnectDevicesSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in pointer-events-none select-none">
      {/* Active Rooms Bar Skeleton */}
      <div className="p-3 sm:p-3.5 rounded-2xl bg-surface/70 border border-surface-hover backdrop-blur-md space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-24 rounded-md bg-surface-hover/80 animate-pulse" />
            <div className="h-4 w-5 rounded-full bg-brand-500/20 animate-pulse" />
          </div>
          <div className="h-7 w-20 rounded-xl bg-surface-hover/50 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 overflow-hidden w-full">
          <div className="h-8 w-36 rounded-xl bg-brand-500/30 border border-brand-500/30 animate-pulse shrink-0" />
          <div className="h-8 w-32 rounded-xl bg-surface-hover/60 border border-surface-hover animate-pulse shrink-0" />
          <div className="h-8 w-28 rounded-xl bg-surface-hover/40 border border-surface-hover animate-pulse shrink-0 hidden sm:block" />
        </div>
      </div>

      {/* Main Room Card Skeleton */}
      <div className="rounded-card p-6 border border-brand-500/20 bg-surface/80 backdrop-blur-xl shadow-xl space-y-5">
        {/* Header Row Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface pb-5">
          <div className="space-y-2">
            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60 animate-pulse" />
              <div className="h-3 w-28 rounded-md bg-surface-hover/80 animate-pulse" />
            </div>

            {/* Room Name & Code Chip */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="h-8 sm:h-9 w-44 sm:w-56 rounded-2xl bg-surface-hover/90 animate-pulse" />
              <div className="h-8 w-24 rounded-xl bg-brand-500/20 border border-brand-500/20 animate-pulse" />
            </div>
          </div>

          {/* Action Buttons Skeleton */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 rounded-xl bg-surface-hover/70 animate-pulse" />
            <div className="h-8 w-20 rounded-xl bg-surface-hover/70 animate-pulse" />
            <div className="h-8 w-16 rounded-xl bg-surface-hover/40 animate-pulse" />
          </div>
        </div>

        {/* Connected Devices Grid Skeleton */}
        <div className="space-y-2.5">
          <div className="h-3 w-36 rounded-md bg-surface-hover/70 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {/* Device Item 1 */}
            <div className="flex items-center gap-3 p-3 rounded-2xl border border-brand-500/30 bg-brand-500/10">
              <div className="h-10 w-10 rounded-xl bg-brand-500/30 animate-pulse shrink-0" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="h-3.5 w-24 rounded-md bg-surface-hover/90 animate-pulse" />
                <div className="h-2.5 w-14 rounded-md bg-surface-hover/50 animate-pulse" />
              </div>
            </div>

            {/* Device Item 2 */}
            <div className="flex items-center gap-3 p-3 rounded-2xl border border-surface-hover bg-surface/60">
              <div className="h-10 w-10 rounded-xl bg-surface-hover/80 animate-pulse shrink-0" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="h-3.5 w-28 rounded-md bg-surface-hover/80 animate-pulse" />
                <div className="h-2.5 w-14 rounded-md bg-surface-hover/50 animate-pulse" />
              </div>
            </div>

            {/* Device Item 3 */}
            <div className="hidden lg:flex items-center gap-3 p-3 rounded-2xl border border-surface-hover bg-surface/60">
              <div className="h-10 w-10 rounded-xl bg-surface-hover/80 animate-pulse shrink-0" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="h-3.5 w-20 rounded-md bg-surface-hover/80 animate-pulse" />
                <div className="h-2.5 w-14 rounded-md bg-surface-hover/50 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Dropzone Skeleton */}
      <div className="rounded-card p-7 sm:p-9 border-2 border-dashed border-surface-hover/70 bg-surface/30 text-center flex flex-col items-center justify-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-brand-500/15 animate-pulse" />
        <div className="space-y-1.5 flex flex-col items-center">
          <div className="h-4 w-48 sm:w-64 rounded-md bg-surface-hover/80 animate-pulse" />
          <div className="h-3 w-36 sm:w-48 rounded-md bg-surface-hover/50 animate-pulse" />
        </div>
      </div>

      {/* Shared Files Feed Skeleton */}
      <div className="rounded-card p-6 border border-surface bg-surface/50 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-surface pb-3">
          <div className="h-4 w-32 rounded-md bg-surface-hover/80 animate-pulse" />
          <div className="h-3 w-28 rounded-md bg-surface-hover/50 animate-pulse" />
        </div>

        {/* File Row Skeleton */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface/70 border border-surface-hover">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-brand-500/20 animate-pulse shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="h-3.5 w-36 sm:w-48 rounded-md bg-surface-hover/90 animate-pulse" />
              <div className="h-2.5 w-20 rounded-md bg-surface-hover/50 animate-pulse" />
            </div>
          </div>
          <div className="h-8 w-20 rounded-xl bg-surface-hover/70 animate-pulse shrink-0 ml-3" />
        </div>
      </div>

      {/* Loading Status Indicator */}
      <div className="flex items-center justify-center gap-2 pt-1 text-xs text-brand-400 font-mono animate-pulse">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        <span>Loading connected rooms...</span>
      </div>
    </div>
  );
}

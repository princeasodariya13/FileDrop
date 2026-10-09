import { RoomDevice } from "@/types/room";

interface DeviceBadgeProps {
  device: RoomDevice;
  isCurrentDevice?: boolean;
  isHostViewer?: boolean;
  onRemoveDevice?: (device: RoomDevice) => void;
}

export function DeviceBadge({
  device,
  isCurrentDevice,
  isHostViewer,
  onRemoveDevice,
}: DeviceBadgeProps) {
  const isMobile = device.deviceType === "mobile";
  const isTablet = device.deviceType === "tablet";
  const canRemove = Boolean(isHostViewer && !device.isHost && !isCurrentDevice && onRemoveDevice);

  return (
    <div
      className={`relative flex items-center justify-between p-3 rounded-2xl border transition-all ${
        isCurrentDevice
          ? "bg-brand-500/10 border-brand-500/40 shadow-sm"
          : "bg-surface/60 border-surface-hover hover:border-brand-500/20"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isCurrentDevice
              ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
              : "bg-surface text-ink-300 border border-surface-hover"
          }`}
        >
          {isMobile ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          ) : isTablet ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-semibold text-ink-50">
              {device.deviceName}
            </p>
            {isCurrentDevice && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-500/20 text-brand-400 border border-brand-500/30">
                You
              </span>
            )}
            {device.isHost && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Host
              </span>
            )}
          </div>
          <p className="text-[10px] text-ink-400 capitalize flex items-center gap-1 mt-0.5 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Online
          </p>
        </div>
      </div>

      {canRemove && (
        <button
          type="button"
          onClick={() => onRemoveDevice?.(device)}
          className="p-1.5 rounded-lg text-ink-400 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-2 shrink-0"
          title={`Remove ${device.deviceName} from room`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="18" y1="8" x2="23" y2="13" />
            <line x1="23" y1="8" x2="18" y2="13" />
          </svg>
        </button>
      )}
    </div>
  );
}

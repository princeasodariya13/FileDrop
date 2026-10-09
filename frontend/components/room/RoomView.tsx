"use client";

import { useState, useRef, useEffect } from "react";

import { RoomState } from "@/types/room";
import { DeviceBadge } from "./DeviceBadge";
import { Button } from "@/components/ui/Button";
import { QRCodeModal } from "@/components/ui/QRCodeModal";
import { formatBytes } from "@/utils/format";
import { useToast } from "@/components/ui/Toast";

interface RoomViewProps {
  room: RoomState;
  currentDeviceId: string | null;
  isConnected: boolean;
  isUploading: boolean;
  uploadProgress: number;
  onUploadFile: (file: File) => Promise<void>;
  onDownloadFile: (fileId: string, fileName: string) => Promise<void>;
  onLeaveRoom: () => void;
}

export function RoomView({
  room,
  currentDeviceId,
  isConnected,
  isUploading,
  uploadProgress,
  onUploadFile,
  onDownloadFile,
  onLeaveRoom,
}: RoomViewProps) {
  const [isQRModalOpen, setIsQRModalOpen] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const [siteUrl, setSiteUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteUrl(window.location.origin);
    }
  }, []);

  const roomInviteUrl = `${siteUrl || process.env.NEXT_PUBLIC_SITE_URL || ""}/room/${room.roomCode}`;


  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedCode(true);
      push("Room code copied to clipboard!", "success");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      push("Failed to copy room code.", "error");
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(roomInviteUrl);
      setCopiedLink(true);
      push("Room invitation link copied!", "success");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      push("Failed to copy link.", "error");
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      onUploadFile(files[i]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Room Header Card */}
      <div className="rounded-card p-6 border border-brand-500/20 bg-surface/80 backdrop-blur-xl shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-400 font-mono">
                {isConnected ? "Live Room Active" : "Connecting..."}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-extrabold font-heading text-ink-50 tracking-wider">
                {room.roomCode}
              </h2>
              <button
                type="button"
                onClick={copyCode}
                className="p-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-surface-hover text-ink-300 hover:text-ink-50 transition-colors"
                title="Copy Room Code"
              >
                {copiedCode ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={copyInviteLink} className="text-xs">
              {copiedLink ? "Link Copied!" : "Copy Link"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsQRModalOpen(true)} className="text-xs">
              Show QR
            </Button>
            <Button variant="ghost" size="sm" onClick={onLeaveRoom} className="text-xs hover:text-red-400 hover:bg-red-500/10">
              Leave
            </Button>
          </div>
        </div>

        {/* Connected Devices Grid */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-400 uppercase tracking-wider font-mono">
              Connected Devices ({room.devices.length})
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {room.devices.map((device) => (
              <DeviceBadge
                key={device.deviceId}
                device={device}
                isCurrentDevice={device.deviceId === currentDeviceId}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-card p-6 sm:p-8 border-2 border-dashed text-center cursor-pointer transition-all ${
          isDragOver
            ? "border-brand-400 bg-brand-500/10 scale-[1.01]"
            : "border-surface-hover hover:border-brand-500/50 bg-surface/40 hover:bg-surface/60"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-400">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink-50">
              Drop files here to share with connected devices
            </p>
            <p className="text-xs text-ink-400">
              or click to browse files from your device
            </p>
          </div>
        </div>
      </div>

      {/* Uploading Status Progress */}
      {isUploading && (
        <div className="rounded-card p-4 bg-brand-500/10 border border-brand-500/30 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between text-xs font-semibold text-brand-300">
            <span>Uploading to shared room...</span>
            <span className="font-mono">{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-brand-500 transition-all duration-300 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Shared Files Feed */}
      <div className="rounded-card p-6 border border-surface space-y-4">
        <div className="flex items-center justify-between border-b border-surface pb-3">
          <h3 className="text-sm font-bold font-heading text-ink-50">
            Shared Room Files ({room.files.length})
          </h3>
          <span className="text-[11px] text-ink-400 font-mono">
            Auto-syncs across devices
          </span>
        </div>

        {room.files.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-ink-400 font-medium">No files shared yet.</p>
            <p className="text-xs text-ink-600 max-w-xs mx-auto">
              Any file dropped above will instantly appear here on all connected phones and computers.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {room.files.map((file) => (
              <div
                key={file.fileId}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-surface/70 border border-surface-hover hover:border-brand-500/30 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink-50">
                      {file.fileName}
                    </p>
                    <p className="text-[11px] text-ink-400 font-mono mt-0.5">
                      {formatBytes(file.sizeBytes)} • by {file.uploadedByDeviceName}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => onDownloadFile(file.fileId, file.fileName)}
                  className="ml-3 text-xs shrink-0"
                >
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Room QR Code Modal */}
      {isQRModalOpen && (
        <QRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          url={roomInviteUrl}
          title={`Live Room #${room.roomCode}`}
          subtitle="Scan with camera to connect device"
          code={room.roomCode}
        />
      )}
    </div>
  );
}


"use client";

import { useState, useEffect } from "react";
import { useConnectRoom } from "@/hooks/useConnectRoom";
import { RoomView } from "@/components/room/RoomView";
import { ConnectDevicesSkeleton } from "@/components/room/ConnectDevicesSkeleton";
import { ToastProvider } from "@/components/ui/Toast";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getSmartDeviceName } from "@/utils/device";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface RoomPageClientProps {
  code: string;
}

function RoomContent({ code }: RoomPageClientProps) {
  const {
    room,
    activeRooms,
    currentRoomCode,
    deviceId,
    isHost,
    isConnected,
    isConnecting,
    isInitializing,
    isUploading,
    uploadProgress,
    uploadingFileName,
    error,
    createRoom,
    joinRoom,
    switchRoom,
    uploadFileToRoom,
    uploadFilesToRoom,
    downloadFile,
    updateFileRecipients,
    deleteFileFromRoom,
    removeDeviceFromRoom,
    updateDeviceName,
    leaveRoom,
  } = useConnectRoom(code);

  const [deviceName, setDeviceName] = useState<string>(() => getSmartDeviceName().deviceName);
  const [previewLoading, setPreviewLoading] = useState<boolean>(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [existingDeviceNames, setExistingDeviceNames] = useState<string[]>([]);
  const [hostName, setHostName] = useState<string | null>(null);

  // Fetch room details to calculate smart collision-free device name
  useEffect(() => {
    let isCancelled = false;
    async function fetchRoomPreview() {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${code}`);
        const body = await res.json();
        if (!isCancelled) {
          if (res.ok && body.success && body.data) {
            const devList = body.data.devices || [];
            const names = devList.map((d: any) => d.deviceName);
            setExistingDeviceNames(names);

            const host = devList.find((d: any) => d.isHost);
            if (host) setHostName(host.deviceName);

            // Compute smart numbered name (e.g. Windows User 2, Android Device 2)
            const smartDefault = getSmartDeviceName(names);
            setDeviceName(smartDefault.deviceName);
          } else {
            setPreviewError(body?.error?.message || "Room not found or has expired.");
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setPreviewError(err?.message || "Could not connect to room server.");
        }
      } finally {
        if (!isCancelled) {
          setPreviewLoading(false);
        }
      }
    }

    if (!room) {
      fetchRoomPreview();
    }

    return () => {
      isCancelled = true;
    };
  }, [code, room]);

  if (isInitializing) {
    return <ConnectDevicesSkeleton />;
  }

  if (room) {
    return (
      <RoomView
        room={room}
        activeRooms={activeRooms}
        currentRoomCode={currentRoomCode}
        currentDeviceId={deviceId}
        isHost={isHost}
        isConnected={isConnected}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        uploadingFileName={uploadingFileName}
        onSwitchRoom={switchRoom}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onUploadFile={uploadFileToRoom}
        onDownloadFile={downloadFile}
        onDeleteFile={deleteFileFromRoom}
        onUpdateRecipients={updateFileRecipients}
        onRemoveDevice={removeDeviceFromRoom}
        onUpdateDeviceName={updateDeviceName}
        onLeaveRoom={leaveRoom}
      />
    );
  }

  return (
    <div className="rounded-card p-6 sm:p-8 border border-surface bg-surface/60 backdrop-blur-xl shadow-xl space-y-6 animate-fade-in max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-400 mb-1">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-mono font-bold tracking-widest uppercase">
          <span>Room #{code}</span>
        </div>

        <h2 className="text-xl font-bold font-heading text-ink-50">
          Join Shared Room
        </h2>
        <p className="text-xs text-ink-300 max-w-sm mx-auto">
          Enter your device name below to connect and transfer files with other devices in this live room.
        </p>
      </div>

      {/* Room Status / Connected Devices Preview */}
      {previewLoading ? (
        <div className="p-4 rounded-xl bg-surface border border-surface-hover flex items-center justify-center gap-2 text-xs text-ink-400 animate-pulse">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
          Checking room #{code}...
        </div>
      ) : previewError ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center space-y-2">
          <p className="text-xs text-red-400 font-medium">{previewError}</p>
          <p className="text-[11px] text-ink-400">
            Please ask the room host for a new 6-digit code or QR invite.
          </p>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-surface border border-surface-hover flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-ink-200 font-medium">
              {hostName ? `Host: ${hostName}` : "Live Room Active"}
            </span>
          </div>
          <span className="text-ink-400 font-mono text-[11px]">
            {existingDeviceNames.length} {existingDeviceNames.length === 1 ? "device" : "devices"} connected
          </span>
        </div>
      )}

      {/* Error from join attempt */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-xs text-red-400 font-medium">{error}</p>
        </div>
      )}

      {/* Device Name Input Form */}
      {!previewError && (
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="device-name-input" className="text-xs font-semibold text-ink-300">
                Your Device Name
              </label>
              <span className="text-[11px] text-brand-400 font-mono">
                Auto-assigned to avoid duplicate names
              </span>
            </div>
            <input
              id="device-name-input"
              type="text"
              value={deviceName}
              maxLength={40}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. Windows User 2, Android Device 2"
              className="w-full rounded-xl bg-surface border border-surface-hover px-3.5 py-2.5 text-xs text-ink-50 focus:border-brand-500 focus:outline-hidden transition-colors"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              disabled={isConnecting || !deviceName.trim() || previewLoading}
              onClick={() => joinRoom(code, deviceName.trim())}
              className="w-full sm:flex-1 py-2.5 text-xs font-semibold"
            >
              {isConnecting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Connecting to Room...
                </span>
              ) : (
                `Join Room #${code}`
              )}
            </Button>
            <Link href="/" className="w-full sm:w-auto">
              <Button variant="ghost" className="w-full text-xs">
                Back to FileDrop
              </Button>
            </Link>
          </div>
        </div>
      )}

      {previewError && (
        <div className="pt-2 text-center">
          <Link href="/">
            <Button variant="secondary" className="text-xs px-6">
              Back to Home
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export function RoomPageClient({ code }: RoomPageClientProps) {
  return (
    <ToastProvider>
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 lg:py-20 animate-fade-in-scale">
        <RoomContent code={code} />
      </div>
    </ToastProvider>
  );
}

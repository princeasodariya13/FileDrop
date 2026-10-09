"use client";

import { useState } from "react";
import { useConnectRoom } from "@/hooks/useConnectRoom";
import { RoomView } from "./RoomView";
import { Button } from "@/components/ui/Button";
import { QRScannerModal } from "@/components/ui/QRScannerModal";
import { getDeviceDefaults } from "@/utils/device";

export function ConnectDevicesSection() {
  const {
    room,
    deviceId,
    isConnected,
    isHost,
    isConnecting,
    isUploading,
    uploadProgress,
    uploadingFileName,
    error,
    createRoom,
    joinRoom,
    uploadFileToRoom,
    uploadFilesToRoom,
    downloadFile,
    deleteFileFromRoom,
    removeDeviceFromRoom,
    leaveRoom,
  } = useConnectRoom();

  const [inputCode, setInputCode] = useState<string>("");
  const [deviceName, setDeviceName] = useState<string>(() => getDeviceDefaults().deviceName);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  if (room) {
    return (
      <RoomView
        room={room}
        currentDeviceId={deviceId}
        isHost={isHost}
        isConnected={isConnected}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        uploadingFileName={uploadingFileName}
        onUploadFile={uploadFileToRoom}
        onDownloadFile={downloadFile}
        onDeleteFile={deleteFileFromRoom}
        onRemoveDevice={removeDeviceFromRoom}
        onLeaveRoom={leaveRoom}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-card p-6 sm:p-8 border border-surface bg-surface/60 backdrop-blur-xl shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-400 mb-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h2 className="text-xl font-bold font-heading text-ink-50">
            Connect Devices &amp; Live Share
          </h2>
          <p className="text-xs sm:text-sm text-ink-300 max-w-md mx-auto">
            Create or join a live multi-device room to share files instantly between phones, tablets, and computers.
          </p>
        </div>

        {/* Device Name Field */}
        <div className="space-y-1.5 max-w-sm mx-auto">
          <label className="text-xs font-semibold text-ink-300">
            Your Device Name
          </label>
          <input
            type="text"
            value={deviceName}
            maxLength={40}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. MacBook, iPhone"
            className="w-full rounded-xl bg-surface border border-surface-hover px-3.5 py-2 text-xs text-ink-50 focus:border-brand-500 focus:outline-hidden transition-colors"
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
            <p className="text-xs text-red-400 font-medium">{error}</p>
          </div>
        )}

        {/* Action Cards: Create vs Join */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Card 1: Create Room */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-surface border border-surface-hover hover:border-brand-500/30 transition-all space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold font-heading text-ink-50">
                Create a New Room
              </h3>
              <p className="text-xs text-ink-400 leading-relaxed">
                Generate a temporary 6-digit room code and QR to connect nearby devices.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={isConnecting}
              onClick={() => createRoom(deviceName)}
            >
              {isConnecting ? "Creating Room..." : "Create Room"}
            </Button>
          </div>

          {/* Card 2: Join Room */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-surface border border-surface-hover hover:border-brand-500/30 transition-all space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold font-heading text-ink-50">
                Join with 6-Digit Code
              </h3>
              <p className="text-xs text-ink-400 leading-relaxed">
                Enter code from another device or scan room QR with camera.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 w-full">
                <input
                  type="text"
                  maxLength={6}
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="min-w-0 flex-1 text-center font-mono text-base font-bold tracking-widest rounded-xl bg-surface border border-surface-hover px-3 py-2.5 text-ink-50 focus:border-brand-500 focus:outline-hidden transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-surface hover:bg-surface-hover border border-surface-hover text-brand-400 hover:text-brand-300 transition-colors"
                  title="Scan QR Code"
                  aria-label="Scan QR Code"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  </svg>
                </button>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                disabled={inputCode.length !== 6 || isConnecting}
                onClick={() => joinRoom(inputCode, deviceName)}
              >
                {isConnecting ? "Joining..." : "Join Room"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {isScannerOpen && (
        <QRScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
    </div>
  );
}

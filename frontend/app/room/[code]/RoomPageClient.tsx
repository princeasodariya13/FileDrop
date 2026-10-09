"use client";

import { useConnectRoom } from "@/hooks/useConnectRoom";
import { RoomView } from "@/components/room/RoomView";
import { ToastProvider } from "@/components/ui/Toast";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface RoomPageClientProps {
  code: string;
}

function RoomContent({ code }: RoomPageClientProps) {
  const {
    room,
    deviceId,
    isConnected,
    isConnecting,
    isUploading,
    uploadProgress,
    uploadingFileName,
    error,
    joinRoom,
    uploadFileToRoom,
    uploadFilesToRoom,
    downloadFile,
    leaveRoom,
  } = useConnectRoom(code);

  if (room) {
    return (
      <RoomView
        room={room}
        currentDeviceId={deviceId}
        isConnected={isConnected}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        uploadingFileName={uploadingFileName}
        onUploadFile={uploadFileToRoom}
        onUploadFiles={uploadFilesToRoom}
        onDownloadFile={downloadFile}
        onLeaveRoom={leaveRoom}
      />
    );
  }

  return (
    <div className="rounded-card p-8 border border-surface bg-surface/60 backdrop-blur-xl shadow-xl text-center space-y-5 animate-fade-in">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </div>

      <div className="space-y-1">
        <h2 className="text-xl font-bold font-heading text-ink-50">
          Join Room #{code}
        </h2>
        <p className="text-xs text-ink-300">
          Connect to this live room to send and receive files in real time.
        </p>
      </div>

      {error ? (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 max-w-sm mx-auto">
          <p className="text-xs text-red-400 font-medium">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <Button
          disabled={isConnecting}
          onClick={() => joinRoom(code)}
          className="w-full sm:w-auto"
        >
          {isConnecting ? "Connecting..." : "Join Room Now"}
        </Button>
        <Link href="/">
          <Button variant="ghost" className="w-full sm:w-auto">
            Back to FileDrop
          </Button>
        </Link>
      </div>
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

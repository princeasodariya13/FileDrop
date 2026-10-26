"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { RoomState, RoomFile, RoomDevice, RoomSummary } from "@/types/room";
import { DeviceBadge } from "./DeviceBadge";
import { ActiveRoomsSelector } from "./ActiveRoomsSelector";
import { Button } from "@/components/ui/Button";
import { QRCodeModal } from "@/components/ui/QRCodeModal";
import { formatBytes, formatTimestamp, formatRelativeExpiry, formatTimeAgo, isRecentUpload, getRoomFileExpiryInfo } from "@/utils/format";
import { useToast } from "@/components/ui/Toast";
import { scrollToElement } from "@/utils/scroll";

export const ROOM_EXPIRATION_OPTIONS = [
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
  { label: "15 minutes (Default)", value: 900 },
  { label: "30 minutes", value: 1800 },
  { label: "45 minutes", value: 2700 },
  { label: "1 hour", value: 3600 },
  { label: "2 hours", value: 7200 },
  { label: "3 hours", value: 10800 },
  { label: "6 hours", value: 21600 },
  { label: "12 hours (Max)", value: 43200 },
];

interface PendingFileItem {
  id: string;
  file: File;
  recipientDeviceIds: string[]; // empty array means "All Connected Devices"
}

interface RoomViewProps {
  room: RoomState;
  activeRooms?: RoomSummary[];
  currentRoomCode?: string | null;
  currentDeviceId: string | null;
  isHost?: boolean;
  isConnected: boolean;
  isUploading: boolean;
  uploadProgress: number;
  uploadingFileName?: string | null;
  initialPendingFiles?: PendingFileItem[];
  onSwitchRoom?: (roomCode: string) => Promise<void>;
  onCreateRoom?: (customDeviceName?: string, customRoomName?: string) => Promise<string>;
  onJoinRoom?: (roomCode: string, customDeviceName?: string) => Promise<string>;
  onUploadFile: (file: File, recipientDeviceIds?: string[], expirationSeconds?: number) => Promise<void>;
  onDownloadFile: (fileId: string, fileName: string, silentToast?: boolean) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  onUpdateRecipients?: (fileId: string, recipientDeviceIds: string[]) => Promise<void>;
  onRemoveDevice?: (deviceId: string) => Promise<void>;
  onUpdateDeviceName?: (newName: string) => Promise<void>;
  onLeaveRoom: () => void;
  onDeleteRoom?: () => Promise<void>;
}

export function RoomView({
  room,
  activeRooms,
  currentRoomCode,
  currentDeviceId,
  isHost,
  isConnected,
  isUploading,
  uploadProgress,
  uploadingFileName,
  initialPendingFiles,
  onSwitchRoom,
  onCreateRoom,
  onJoinRoom,
  onUploadFile,
  onDownloadFile,
  onDeleteFile,
  onUpdateRecipients,
  onRemoveDevice,
  onUpdateDeviceName,
  onLeaveRoom,
  onDeleteRoom,
}: RoomViewProps) {
  const [mounted, setMounted] = useState<boolean>(false);
  const [isEditDeviceModalOpen, setIsEditDeviceModalOpen] = useState(false);
  const [editDeviceNameInput, setEditDeviceNameInput] = useState("");
  const [isUpdatingDeviceName, setIsUpdatingDeviceName] = useState(false);
  const [editDeviceError, setEditDeviceError] = useState<string | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pending files selection & expiration timer state (default: 15 min = 900s)
  const [pendingFiles, setPendingFiles] = useState<PendingFileItem[]>(() => initialPendingFiles || []);
  const [selectedExpirationSeconds, setSelectedExpirationSeconds] = useState<number>(900);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  // Live ticking clock for accurate real-time file expiration countdowns
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState<boolean>(false);
  const [downloadAllProgress, setDownloadAllProgress] = useState<{ current: number; total: number } | null>(null);

  // Track files downloaded by this receiver device (persisted per room)
  const [downloadedFileIds, setDownloadedFileIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(`filedrop_downloaded_room_files_${room.roomCode}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set();
  });

  const markFileAsDownloaded = (fileId: string) => {
    setDownloadedFileIds((prev) => {
      if (prev.has(fileId)) return prev;
      const next = new Set(prev);
      next.add(fileId);
      try {
        localStorage.setItem(
          `filedrop_downloaded_room_files_${room.roomCode}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  const [fileToDelete, setFileToDelete] = useState<RoomFile | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Edit file recipients state
  const [fileToEditRecipients, setFileToEditRecipients] = useState<RoomFile | null>(null);
  const [editRecipientIds, setEditRecipientIds] = useState<string[]>([]);
  const [isSavingRecipients, setIsSavingRecipients] = useState<boolean>(false);

  // Device removal state
  const [deviceToRemove, setDeviceToRemove] = useState<{ deviceId: string; deviceName: string } | null>(null);
  const [isRemovingDevice, setIsRemovingDevice] = useState<boolean>(false);

  // Leave room state
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);

  // Prevent background scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(fileToDelete || deviceToRemove || isLeaveModalOpen || isQRModalOpen);
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [fileToDelete, deviceToRemove, isLeaveModalOpen, isQRModalOpen]);

  const [siteUrl, setSiteUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sharedFilesRef = useRef<HTMLDivElement>(null);
  const { push } = useToast();

  // Auto-scroll to pending files when user selects files to share
  useEffect(() => {
    if (pendingFiles.length > 0) {
      scrollToElement(dropdownRef.current);
    }
  }, [pendingFiles.length]);

  // Auto-scroll to shared files feed when a new file is uploaded/added to the room
  const prevFilesCount = useRef(room.files.length);
  useEffect(() => {
    if (room.files.length > prevFilesCount.current) {
      scrollToElement(sharedFilesRef.current);
    }
    prevFilesCount.current = room.files.length;
  }, [room.files.length]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteUrl(window.location.origin);
    }
  }, []);

  // Close recipient dropdown & menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownId(null);
      }
    };
    if (activeDropdownId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeDropdownId]);

  const roomInviteUrl = `${siteUrl || process.env.NEXT_PUBLIC_SITE_URL || ""}/room/${room.roomCode}`;

  // Connected peer devices (excluding this uploading device)
  const peerDevices = useMemo(() => {
    return room.devices.filter((d) => d.deviceId !== currentDeviceId);
  }, [room.devices, currentDeviceId]);

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

  // Add selected files to the pending selection list without uploading immediately
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);

    setPendingFiles((prev) => {
      const existingKeys = new Set(
        prev.map((item) => `${item.file.name}-${item.file.size}-${item.file.lastModified}`)
      );
      const uniqueNewItems: PendingFileItem[] = [];

      for (const f of newFiles) {
        const key = `${f.name}-${f.size}-${f.lastModified}`;
        if (!existingKeys.has(key)) {
          uniqueNewItems.push({
            id: `${key}-${Math.random().toString(36).slice(2, 9)}`,
            file: f,
            recipientDeviceIds: [], // Default: All Connected Devices
          });
        }
      }

      if (uniqueNewItems.length < newFiles.length) {
        push("Duplicate files were ignored from selection.", "info");
      }
      return [...prev, ...uniqueNewItems];
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Remove single file from pending queue
  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => prev.filter((item) => item.id !== id));
    if (activeDropdownId === id) {
      setActiveDropdownId(null);
    }
  };

  // Clear all pending files
  const clearPendingFiles = () => {
    setPendingFiles([]);
    setActiveDropdownId(null);
  };

  // Recipient selection toggles for a pending file item
  const selectAllDevices = (itemId: string) => {
    setPendingFiles((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, recipientDeviceIds: [] } : item))
    );
  };

  const toggleRecipientDevice = (itemId: string, targetDeviceId: string) => {
    setPendingFiles((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const exists = item.recipientDeviceIds.includes(targetDeviceId);
        let nextRecipients: string[];
        if (exists) {
          nextRecipients = item.recipientDeviceIds.filter((id) => id !== targetDeviceId);
        } else {
          nextRecipients = [...item.recipientDeviceIds, targetDeviceId];
        }
        return {
          ...item,
          recipientDeviceIds: nextRecipients,
        };
      })
    );
  };

  // Start uploading pending files sequentially with chosen expiration duration
  const uploadPendingFiles = async () => {
    if (pendingFiles.length === 0 || isUploading) return;

    let anyUploaded = false;
    const itemsToUpload = [...pendingFiles];
    for (let i = 0; i < itemsToUpload.length; i++) {
      const item = itemsToUpload[i];
      try {
        await onUploadFile(
          item.file,
          item.recipientDeviceIds.length > 0 ? item.recipientDeviceIds : undefined,
          selectedExpirationSeconds
        );
        // Remove successfully uploaded file from pending list
        setPendingFiles((prev) => prev.filter((p) => p.id !== item.id));
        anyUploaded = true;
      } catch (err: any) {
        // Stop sequential queue on error so remaining files are preserved for retry
        break;
      }
    }
    if (anyUploaded) {
      scrollToElement(sharedFilesRef.current);
    }
  };

  // Visible room files (strictly filtering out any files that reached the 30s post-expiry auto-delete threshold)
  const visibleRoomFiles = useMemo(() => {
    return room.files.filter((file) => {
      const expiry = getRoomFileExpiryInfo(file.expiresAt, currentTime);
      return !expiry.isPermanentlyDeleted;
    });
  }, [room.files, currentTime]);

  // All shared files in the room authorized for this device to download (strictly excluding expired files)
  const downloadableFiles = useMemo(() => {
    return visibleRoomFiles.filter((file) => {
      // Exclude expired files
      const expiry = getRoomFileExpiryInfo(file.expiresAt, currentTime);
      if (expiry.isExpired) return false;
      // If file has specific recipient devices, only allow if current device is a recipient or uploader
      if (!file.recipientDeviceIds || file.recipientDeviceIds.length === 0) return true;
      if (file.uploadedByDeviceId === currentDeviceId) return true;
      if (currentDeviceId && file.recipientDeviceIds.includes(currentDeviceId)) return true;
      return false;
    });
  }, [visibleRoomFiles, currentDeviceId, currentTime]);

  const handleDownload = async (fileId: string, fileName: string) => {
    const targetFile = room.files.find((f) => f.fileId === fileId);
    const expiry = getRoomFileExpiryInfo(targetFile?.expiresAt, currentTime);
    if (expiry.isExpired) {
      push(`"${fileName}" has expired and can no longer be downloaded.`, "error");
      return;
    }

    try {
      setDownloadingFileId(fileId);
      await onDownloadFile(fileId, fileName, true);
      markFileAsDownloaded(fileId);
      push(`"${fileName}" download started successfully!`, "success");
    } catch (err: any) {
      push(err?.message || "Failed to download file.", "error");
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (downloadableFiles.length === 0 || isDownloadingAll) return;
    setIsDownloadingAll(true);
    setDownloadAllProgress({ current: 0, total: downloadableFiles.length });

    push(
      `Starting download of ${downloadableFiles.length} file${
        downloadableFiles.length === 1 ? "" : "s"
      }...`,
      "info"
    );

    let successCount = 0;
    for (let i = 0; i < downloadableFiles.length; i++) {
      const file = downloadableFiles[i];
      setDownloadAllProgress({ current: i + 1, total: downloadableFiles.length });
      try {
        await onDownloadFile(file.fileId, file.fileName, true);
        markFileAsDownloaded(file.fileId);
        successCount++;
      } catch (err: any) {
        console.error(`Failed to download ${file.fileName}:`, err);
      }
      // Add a 400ms delay between downloads to prevent browsers from blocking multiple downloads
      if (i < downloadableFiles.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    setIsDownloadingAll(false);
    setDownloadAllProgress(null);

    if (successCount === downloadableFiles.length) {
      push(`All ${successCount} files downloaded successfully!`, "success");
    } else if (successCount > 0) {
      push(`Downloaded ${successCount} of ${downloadableFiles.length} files.`, "info");
    }
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteFile(fileToDelete.fileId);
      setFileToDelete(null);
    } catch (err) {
      // Error toast is handled in hook
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleEditRecipient = (targetDeviceId: string) => {
    setEditRecipientIds((prev) => {
      if (prev.includes(targetDeviceId)) {
        return prev.filter((id) => id !== targetDeviceId);
      } else {
        return [...prev, targetDeviceId];
      }
    });
  };

  const handleSaveRecipients = async () => {
    if (!fileToEditRecipients || !onUpdateRecipients) return;
    setIsSavingRecipients(true);
    try {
      await onUpdateRecipients(fileToEditRecipients.fileId, editRecipientIds);
      setFileToEditRecipients(null);
    } catch (err) {
      // Error toast is handled in hook
    } finally {
      setIsSavingRecipients(false);
    }
  };

  const confirmRemoveDevice = async () => {
    if (!deviceToRemove || !onRemoveDevice) return;
    setIsRemovingDevice(true);
    try {
      await onRemoveDevice(deviceToRemove.deviceId);
      setDeviceToRemove(null);
    } catch (err) {
      // Error toast is handled in hook
    } finally {
      setIsRemovingDevice(false);
    }
  };

  const handleConfirmLeave = async () => {
    setIsLeaving(true);
    try {
      if (isHost && onDeleteRoom) {
        await onDeleteRoom();
      } else {
        await onLeaveRoom();
      }
      setIsLeaveModalOpen(false);
    } catch (err) {
      // Toast is handled in hook
    } finally {
      setIsLeaving(false);
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
    handleFilesSelected(e.dataTransfer.files);
  };

  // Group shared files by uploader device
  const groupedFiles = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        deviceId: string;
        deviceName: string;
        isCurrentDevice: boolean;
        files: RoomFile[];
        totalSizeBytes: number;
        latestUploadTime?: string;
      }
    >();

    for (const file of visibleRoomFiles) {
      const devId = file.uploadedByDeviceId || "unknown";
      let group = groupsMap.get(devId);
      if (!group) {
        group = {
          deviceId: devId,
          deviceName: file.uploadedByDeviceName || "Connected Device",
          isCurrentDevice: devId === currentDeviceId,
          files: [],
          totalSizeBytes: 0,
          latestUploadTime: file.createdAt ? String(file.createdAt) : undefined,
        };
        groupsMap.set(devId, group);
      }
      group.files.push(file);
      group.totalSizeBytes += file.sizeBytes;
      if (file.createdAt) {
        if (!group.latestUploadTime || new Date(file.createdAt).getTime() > new Date(group.latestUploadTime).getTime()) {
          group.latestUploadTime = String(file.createdAt);
        }
      }
    }

    // Sort files within each device group: newest upload first
    for (const group of groupsMap.values()) {
      group.files.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    // Sort groups: current device first, then by most recent upload
    return Array.from(groupsMap.values()).sort((a, b) => {
      if (a.isCurrentDevice) return -1;
      if (b.isCurrentDevice) return 1;
      const latestA = a.latestUploadTime ? new Date(a.latestUploadTime).getTime() : 0;
      const latestB = b.latestUploadTime ? new Date(b.latestUploadTime).getTime() : 0;
      if (latestA !== latestB) return latestB - latestA;
      return b.files.length - a.files.length;
    });
  }, [visibleRoomFiles, currentDeviceId]);

  // Count how many downloadable files have been downloaded by receiver
  const downloadedCount = useMemo(() => {
    return downloadableFiles.filter((f) => downloadedFileIds.has(f.fileId)).length;
  }, [downloadableFiles, downloadedFileIds]);

  const totalPendingSize = useMemo(() => {
    return pendingFiles.reduce((acc, item) => acc + item.file.size, 0);
  }, [pendingFiles]);

  // Helper to format recipient names on shared file cards
  const formatRecipientDisplay = (file: RoomFile) => {
    if (!file.recipientDeviceIds || file.recipientDeviceIds.length === 0) {
      return { isPrivate: false, text: "All devices" };
    }

    const names = file.recipientDeviceIds.map((id) => {
      if (id === currentDeviceId) return "You";
      const dev = room.devices.find((d) => d.deviceId === id);
      return dev ? dev.deviceName : "Device";
    });

    if (names.length === 1) {
      return { isPrivate: true, text: names[0] };
    }
    return { isPrivate: true, text: `${names.length} devices (${names.slice(0, 2).join(", ")}${names.length > 2 ? "..." : ""})` };
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Active Rooms Switcher & Manager Bar */}
      {activeRooms && activeRooms.length > 0 && onSwitchRoom && onCreateRoom && onJoinRoom && (
        <div className="relative z-30">
          <ActiveRoomsSelector
            activeRooms={activeRooms}
            currentRoomCode={currentRoomCode || room.roomCode}
            onSwitchRoom={onSwitchRoom}
            onCreateRoom={onCreateRoom}
            onJoinRoom={onJoinRoom}
          />
        </div>
      )}

      {/* Room Header Card */}
      <div className="rounded-3xl p-4 sm:p-6 md:p-8 border border-surface-hover bg-bg-panel/90 backdrop-blur-xl shadow-xs space-y-5 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface pb-4 sm:pb-5">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-400 font-mono">
                {isConnected ? "Live Room Active" : "Connecting..."}
              </span>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold font-heading text-ink-50 break-words">
                {room.roomName || "Live Room"}
              </h2>

              <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 font-mono font-bold text-xs sm:text-sm tracking-wider shrink-0">
                <span>#{room.roomCode}</span>
                <button
                  type="button"
                  onClick={copyCode}
                  className="p-1 rounded-md hover:bg-brand-500/20 text-brand-400 hover:text-brand-300 transition-colors ml-0.5 cursor-pointer"
                  title="Copy Room Code"
                >
                  {copiedCode ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="text-emerald-400"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Direct Action Buttons: Copy Invite Link, Show QR, Leave Room */}
          <div className="grid grid-cols-3 sm:flex items-center gap-2 shrink-0 w-full md:w-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={copyInviteLink}
              className="text-xs py-2 px-1.5 sm:px-3 rounded-xl w-full sm:w-auto justify-center cursor-pointer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1.5 text-brand-400 shrink-0"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span className="truncate">{copiedLink ? "Copied!" : "Copy Link"}</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsQRModalOpen(true)}
              className="text-xs py-2 px-1.5 sm:px-3 rounded-xl w-full sm:w-auto justify-center cursor-pointer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1.5 text-brand-400 shrink-0"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span className="truncate">Show QR</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLeaveModalOpen(true)}
              className="text-xs py-2 px-1.5 sm:px-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 w-full sm:w-auto justify-center cursor-pointer"
              title={isHost ? "Delete this room permanently" : "Leave this room"}
            >
              {isHost ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-1.5 shrink-0"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-1.5 shrink-0"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              )}
              <span className="truncate">{isHost ? "Delete Room" : "Leave Room"}</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {room.devices.map((device) => (
              <DeviceBadge
                key={device.deviceId}
                device={device}
                isCurrentDevice={device.deviceId === currentDeviceId}
                isHostViewer={isHost}
                onRemoveDevice={(d) => setDeviceToRemove(d)}
                onEditDeviceName={(d) => {
                  setEditDeviceNameInput(d.deviceName || "");
                  setEditDeviceError(null);
                  setIsEditDeviceModalOpen(true);
                }}
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
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`rounded-3xl p-5 sm:p-8 md:p-10 border-2 border-dashed text-center transition-all ${
          isUploading
            ? "border-surface-hover bg-surface/30 opacity-70 cursor-not-allowed"
            : isDragOver
            ? "border-brand-500 bg-brand-500/10 scale-[1.01] cursor-pointer"
            : "border-surface-hover hover:border-brand-500/60 bg-surface/30 hover:bg-surface/50 cursor-pointer"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          disabled={isUploading}
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-400">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink-50">
              {isUploading
                ? "Uploading selected files..."
                : "Select or drop files to share in room"}
            </p>
            <p className="text-xs text-ink-400">
              Choose recipients and review before uploading
            </p>
          </div>
        </div>
      </div>

      {/* Pending Files Selection List (Review & choose recipients before uploading) */}
      {pendingFiles.length > 0 && (
        <div
          ref={dropdownRef}
          className="relative z-20 rounded-3xl p-4 sm:p-6 border border-surface-hover bg-bg-panel/95 backdrop-blur-xl shadow-xs space-y-4 animate-fade-in overflow-visible"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold font-heading text-ink-50 flex items-center gap-2">
                <span>Selected Files</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-brand-500/20 text-brand-300">
                  {pendingFiles.length} {pendingFiles.length === 1 ? "file" : "files"} • {formatBytes(totalPendingSize)}
                </span>
              </h3>
              <p className="text-xs text-ink-400">
                Choose recipients per file, then upload to share
              </p>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={isUploading}
                onClick={clearPendingFiles}
                className="text-xs text-ink-400 hover:text-red-400"
              >
                Clear All
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                + Add More
              </Button>
            </div>
          </div>

          <div className="space-y-2.5 overflow-visible">
            {pendingFiles.map((item) => {
              const isDropdownOpen = activeDropdownId === item.id;
              const hasSpecificRecipients = item.recipientDeviceIds.length > 0;

              // Format recipient label on the button
              let recipientButtonLabel = "All Connected Devices";
              if (hasSpecificRecipients) {
                if (item.recipientDeviceIds.length === 1) {
                  const targetDev = room.devices.find((d) => d.deviceId === item.recipientDeviceIds[0]);
                  recipientButtonLabel = targetDev ? targetDev.deviceName : "1 Device";
                } else {
                  recipientButtonLabel = `${item.recipientDeviceIds.length} Devices`;
                }
              }

              return (
                <div
                  key={item.id}
                  className={`relative flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 p-3 rounded-2xl border transition-all ${
                    isDropdownOpen
                      ? "z-40 bg-surface/95 border-brand-500/50 shadow-xl ring-1 ring-brand-500/30"
                      : "z-10 bg-surface/60 border-surface-hover hover:border-brand-500/20"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink-50">{item.file.name}</p>
                      <p className="text-[11px] text-ink-400 font-mono">{formatBytes(item.file.size)}</p>
                    </div>
                  </div>

                  {/* Share With Recipient Selector & Remove */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t border-surface/50 sm:border-0">
                    <div className="relative">
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => setActiveDropdownId(isDropdownOpen ? null : item.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                          hasSpecificRecipients
                            ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                            : "bg-surface hover:bg-surface-hover border-surface-hover text-ink-200"
                        }`}
                        title="Choose who can view and download this file"
                      >
                        {hasSpecificRecipients ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-400">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                        )}
                        <span className="text-[11px] text-ink-400">Share with:</span>
                        <span className="max-w-[120px] sm:max-w-[130px] truncate font-semibold">
                          {recipientButtonLabel}
                        </span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-400">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {/* Recipient Dropdown Menu — Theme Adaptive Card with High Stacking Context */}
                      {isDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2.5rem)] rounded-2xl dropdown-card p-2.5 z-50 space-y-1.5 animate-scale-up ring-1 ring-black/10 dark:ring-white/10">
                          <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider modal-sub">
                            Select Recipients
                          </div>

                          {/* Default: All Connected Devices */}
                          <button
                            type="button"
                            onClick={() => selectAllDevices(item.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors text-left ${
                              !hasSpecificRecipients
                                ? "bg-brand-500/15 text-brand-600 dark:text-brand-300 font-semibold border border-brand-500/30"
                                : "dropdown-item rounded-xl"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span>🌐</span>
                              <span>All Connected Devices</span>
                            </span>
                            {!hasSpecificRecipients && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-500">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>

                          <div className="my-1 border-t border-surface" />

                          <div className="px-2 py-0.5 text-[10px] font-semibold modal-sub uppercase tracking-wider">
                            Or Specific Devices
                          </div>

                          {peerDevices.length === 0 ? (
                            <div className="px-2.5 py-2 text-[11px] modal-sub italic">
                              No other devices connected yet.
                            </div>
                          ) : (
                            <div className="space-y-0.5 max-h-48 overflow-y-auto no-scrollbar">
                              {peerDevices.map((peer) => {
                                const isChecked = item.recipientDeviceIds.includes(peer.deviceId);
                                return (
                                  <button
                                    key={peer.deviceId}
                                    type="button"
                                    onClick={() => toggleRecipientDevice(item.id, peer.deviceId)}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors text-left ${
                                      isChecked
                                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold border border-amber-500/30"
                                        : "dropdown-item rounded-xl"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2 truncate">
                                      <input
                                        type="checkbox"
                                        readOnly
                                        checked={isChecked}
                                        className="rounded border-surface text-amber-500 focus:ring-0"
                                      />
                                      <span className="truncate">{peer.deviceName}</span>
                                      {peer.isHost && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-brand-500/20 text-brand-600 dark:text-brand-300">
                                          Host
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => removePendingFile(item.id)}
                      className="p-1.5 rounded-lg text-ink-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove from selection"
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
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-surface/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* File Visibility / Expiration Dropdown */}
            <div className="flex items-center gap-2 flex-wrap">
              <label
                htmlFor="room-file-timer-select"
                className="flex items-center gap-1.5 text-xs font-medium text-ink-300 shrink-0"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-brand-500 shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Expires in:</span>
              </label>

              <div className="relative inline-block">
                <select
                  id="room-file-timer-select"
                  value={selectedExpirationSeconds}
                  onChange={(e) => setSelectedExpirationSeconds(Number(e.target.value))}
                  disabled={isUploading}
                  className="focus-ring rounded-xl border border-surface-hover bg-surface/90 hover:border-brand-500/50 py-1.5 pl-3 pr-8 text-xs font-semibold text-ink-100 transition-all cursor-pointer appearance-none shadow-xs disabled:opacity-50"
                  title="Choose how long these files stay visible in the room"
                >
                  {ROOM_EXPIRATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-bg-panel text-ink-100 py-1">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-ink-400">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <Button
              className="w-full sm:w-auto text-xs px-6"
              disabled={isUploading}
              onClick={uploadPendingFiles}
            >
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Uploading...
                </span>
              ) : (
                `Upload & Share ${pendingFiles.length} ${
                  pendingFiles.length === 1 ? "File" : "Files"
                }`
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Uploading Status Progress Bar */}
      {isUploading && (
        <div className="rounded-card p-4 bg-brand-500/10 border border-brand-500/30 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between text-xs font-semibold text-brand-300">
            <span className="truncate max-w-[70%]">
              {uploadingFileName ? `Uploading ${uploadingFileName}...` : "Uploading to shared room..."}
            </span>
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

      {/* Shared Files Feed — Organized by Uploader */}
      <div ref={sharedFilesRef} className="rounded-3xl p-4 sm:p-6 md:p-8 border border-surface-hover bg-bg-panel/90 backdrop-blur-xl shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface pb-3.5">
          <div className="flex items-center justify-between sm:justify-start gap-2.5 flex-wrap">
            <h3 className="text-sm font-bold font-heading text-ink-50 flex items-center gap-2">
              <span>Shared Room Files</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-surface-hover text-ink-300">
                {visibleRoomFiles.length}
              </span>
            </h3>
            {downloadedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-mono">
                {downloadedCount} of {downloadableFiles.length} downloaded
              </span>
            )}
            <span className="text-[11px] text-ink-400 font-mono hidden xs:inline-block">
              • Auto-syncs across devices
            </span>
          </div>

          {/* Download All Button (Top Section) */}
          {downloadableFiles.length > 0 && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isDownloadingAll || isUploading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDownloadAll();
              }}
              className="text-xs py-2 px-3.5 rounded-xl font-semibold w-full sm:w-auto justify-center shadow-xs cursor-pointer"
            >
              {isDownloadingAll ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>
                    Downloading {downloadAllProgress?.current || 1} of {downloadAllProgress?.total || downloadableFiles.length}...
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Download All ({downloadableFiles.length})</span>
                </span>
              )}
            </Button>
          )}
        </div>

        {visibleRoomFiles.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-ink-400 font-medium">No files shared yet.</p>
            <p className="text-xs text-ink-600 max-w-xs mx-auto">
              Select or drop files above to share them with connected phones and computers.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedFiles.map((group) => (
              <div key={group.deviceId} className="space-y-3">
                {/* Uploader Section Header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400 text-xs">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </div>
                    <span className="text-xs font-bold text-ink-100 flex items-center gap-1.5">
                      {group.deviceName}
                      {group.isCurrentDevice && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-brand-500/20 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                          You
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-ink-400">
                    {group.files.length} {group.files.length === 1 ? "file" : "files"} • {formatBytes(group.totalSizeBytes)}
                  </span>
                </div>

                {/* Files uploaded by this device */}
                <div className="space-y-2.5">
                  {group.files.map((file) => {
                    const isDownloading = downloadingFileId === file.fileId;
                    const canDelete = file.uploadedByDeviceId === currentDeviceId;
                    const recipientInfo = formatRecipientDisplay(file);
                    const isDownloaded = downloadedFileIds.has(file.fileId);
                    const isRecentlyUploaded = isRecentUpload(file.createdAt, 5, currentTime);
                    const expiryInfo = getRoomFileExpiryInfo(file.expiresAt, currentTime);
                    const isFileExpired = expiryInfo.isExpired;

                    return (
                      <div
                        key={file.fileId}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-3.5 rounded-2xl border transition-all gap-3 ${
                          isDownloaded
                            ? "bg-surface/80 border-emerald-500/30 shadow-xs"
                            : "bg-surface/70 border-surface-hover hover:border-brand-500/30"
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl mt-0.5 sm:mt-0 transition-colors ${
                            isDownloaded ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-brand-500/20 text-brand-600 dark:text-brand-400"
                          }`}>
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
                              <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p
                                className="truncate text-xs sm:text-sm font-semibold text-ink-50 leading-snug"
                                title={file.fileName}
                              >
                                {file.fileName}
                              </p>
                              {isRecentlyUploaded && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                                  Recently Added
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-400 font-mono">
                              <span>{formatBytes(file.sizeBytes)}</span>

                              {/* Upload timestamp - Clear & visible across all mobile & desktop viewports */}
                              {file.createdAt && (
                                <span
                                  suppressHydrationWarning
                                  className="inline-flex items-center gap-1 text-ink-400 dark:text-ink-300 font-sans"
                                  title={`Uploaded at ${formatTimestamp(file.createdAt)}`}
                                >
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="text-ink-400 shrink-0"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                  <span>{formatTimestamp(file.createdAt)}</span>
                                  <span className="text-ink-500 font-medium">({formatTimeAgo(file.createdAt, currentTime)})</span>
                                </span>
                              )}

                              {/* Timer / Expiration pill */}
                              {file.expiresAt && (
                                <span
                                  suppressHydrationWarning
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium transition-all ${
                                    isFileExpired
                                      ? "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30 animate-pulse"
                                      : "bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20"
                                  }`}
                                  title={
                                    isFileExpired
                                      ? `Expired — permanently deleting in ${expiryInfo.secondsUntilDelete}s`
                                      : `Expires: ${new Date(file.expiresAt).toLocaleTimeString()}`
                                  }
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                  <span>{expiryInfo.badgeText}</span>
                                </span>
                              )}
                              {/* Recipient status pill */}
                              {recipientInfo.isPrivate ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                  </svg>
                                  <span>Shared with: {recipientInfo.text}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium bg-surface text-ink-400 border border-surface-hover">
                                  <span>Shared with: All devices</span>
                                </span>
                              )}
                            </div>

                            {/* Downloaded successfully green confirmation text */}
                            {isDownloaded && (
                              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 pt-0.5 animate-fade-in">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Downloaded successfully</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* File Action Controls */}
                        <div className="flex items-center justify-end sm:justify-start gap-2 pt-2 sm:pt-0 border-t border-surface/50 sm:border-0 shrink-0">
                          {/* Individual Download / Download Again Button */}
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isDownloading || isDownloadingAll || isFileExpired}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isFileExpired) return;
                              handleDownload(file.fileId, file.fileName);
                            }}
                            title={
                              isFileExpired
                                ? "This file has expired and cannot be downloaded"
                                : isDownloaded
                                ? "Download again to this device"
                                : "Download file to this device"
                            }
                            className={`text-xs py-1.5 px-3 rounded-xl flex-1 sm:flex-initial justify-center transition-all ${
                              isFileExpired
                                ? "!opacity-50 !cursor-not-allowed !pointer-events-none bg-surface/40 border-surface text-ink-500"
                                : isDownloaded
                                ? "cursor-pointer border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 font-semibold"
                                : "cursor-pointer"
                            }`}
                          >
                            {isDownloading ? (
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                                <span>Downloading...</span>
                              </span>
                            ) : isFileExpired ? (
                              <span className="flex items-center gap-1.5 text-ink-400">
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                </svg>
                                <span>Expired</span>
                              </span>
                            ) : isDownloaded ? (
                              <span className="flex items-center gap-1.5">
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <span>Download Again</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <span>Download</span>
                              </span>
                            )}
                          </Button>

                          {/* Edit Recipients button (uploader only) */}
                          {canDelete && onUpdateRecipients && (
                            <button
                              type="button"
                              onClick={() => {
                                setFileToEditRecipients(file);
                                setEditRecipientIds(file.recipientDeviceIds || []);
                              }}
                              className="p-1.5 sm:p-2 rounded-xl text-ink-400 hover:text-brand-400 hover:bg-brand-500/10 border border-surface sm:border-transparent transition-colors cursor-pointer"
                              title="Edit recipients for this file"
                            >
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="8.5" cy="7" r="4" />
                                <polyline points="17 11 19 13 23 9" />
                              </svg>
                            </button>
                          )}

                          {/* Delete button (uploader only) */}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setFileToDelete(file)}
                              className="p-1.5 sm:p-2 rounded-xl text-ink-400 hover:text-red-400 hover:bg-red-500/10 border border-surface sm:border-transparent transition-colors cursor-pointer"
                              title="Delete this file"
                            >
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Recipients Modal */}
      {mounted && typeof document !== "undefined" && fileToEditRecipients && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl modal-card p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 animate-scale-up z-[100000] max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-1 border-b border-surface-hover">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
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
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <polyline points="17 11 19 13 23 9" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold font-heading modal-title">
                    Edit File Recipients
                  </h3>
                  <p className="text-xs modal-sub truncate max-w-[240px]" title={fileToEditRecipients.fileName}>
                    {fileToEditRecipients.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFileToEditRecipients(null)}
                className="p-1.5 rounded-xl text-ink-400 hover:text-ink-50 hover:bg-surface-hover transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <p className="text-xs modal-body leading-relaxed">
              Select which devices can view and download this file. Changes apply immediately in real-time.
            </p>

            {/* Recipient Options */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {/* Option 1: All Connected Devices */}
              <div
                onClick={() => setEditRecipientIds([])}
                className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                  editRecipientIds.length === 0
                    ? "bg-brand-500/10 border-brand-500/40 shadow-xs"
                    : "bg-surface/50 border-surface-hover hover:border-brand-500/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-4 w-4 rounded-full border flex items-center justify-center transition-all ${
                    editRecipientIds.length === 0
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-ink-400"
                  }`}>
                    {editRecipientIds.length === 0 && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink-50">All Connected Devices</p>
                    <p className="text-[10px] text-ink-400">Any device in this room can view &amp; download</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-500/20 text-brand-400 border border-brand-500/30">
                  Public in room
                </span>
              </div>

              {/* Option 2: Specific Peer Devices */}
              {peerDevices.length === 0 ? (
                <div className="p-3 text-center rounded-2xl bg-surface border border-surface-hover">
                  <p className="text-xs text-ink-400">No other devices connected yet.</p>
                </div>
              ) : (
                peerDevices.map((peer) => {
                  const isChecked = editRecipientIds.includes(peer.deviceId);
                  return (
                    <div
                      key={peer.deviceId}
                      onClick={() => handleToggleEditRecipient(peer.deviceId)}
                      className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                        isChecked
                          ? "bg-brand-500/10 border-brand-500/40 shadow-xs"
                          : "bg-surface/50 border-surface-hover hover:border-brand-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by container onClick
                          className="h-4 w-4 rounded border-ink-400 text-brand-500 focus:ring-brand-500 pointer-events-none"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-ink-50 truncate">
                            {peer.deviceName}
                          </p>
                          <p className="text-[10px] text-ink-400 capitalize font-mono">
                            {peer.deviceType} • Online
                          </p>
                        </div>
                      </div>
                      {peer.isHost && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 ml-2">
                          Host
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-hover">
              <button
                type="button"
                disabled={isSavingRecipients}
                onClick={() => setFileToEditRecipients(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold modal-cancel-btn transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingRecipients}
                onClick={handleSaveRecipients}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-500/20 transition-all"
              >
                {isSavingRecipients ? "Saving..." : "Save Recipients"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {mounted && typeof document !== "undefined" && fileToDelete && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl modal-card p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-up z-[100000] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold font-heading modal-title">Delete Shared File?</h3>
                <p className="text-xs modal-sub">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs modal-body leading-relaxed">
              Are you sure you want to remove{" "}
              <span className="font-semibold modal-title">"{fileToDelete.fileName}"</span> from the
              room? Connected devices will no longer be able to download it.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold modal-cancel-btn transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteFile}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20 transition-all"
              >
                {isDeleting ? "Deleting..." : "Delete File"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Device Removal Confirmation Modal */}
      {mounted && typeof document !== "undefined" && deviceToRemove && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl modal-card p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-up z-[100000] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500">
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
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="18" y1="8" x2="23" y2="13" />
                  <line x1="23" y1="8" x2="18" y2="13" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold font-heading modal-title">Remove Device?</h3>
                <p className="text-xs modal-sub">Disconnect from live room</p>
              </div>
            </div>

            <p className="text-xs modal-body leading-relaxed">
              Are you sure you want to remove{" "}
              <span className="font-semibold modal-title">"{deviceToRemove.deviceName}"</span> from
              this room? It will be disconnected immediately and cannot reconnect using its current session.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isRemovingDevice}
                onClick={() => setDeviceToRemove(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold modal-cancel-btn transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRemovingDevice}
                onClick={confirmRemoveDevice}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20 transition-all"
              >
                {isRemovingDevice ? "Removing..." : "Remove Device"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Leave Room Confirmation Modal */}
      {mounted && typeof document !== "undefined" && isLeaveModalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl modal-card p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-up z-[100000] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500">
                {isHost ? (
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
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold font-heading modal-title">
                  {isHost ? "Delete Room Permanently?" : "Leave Live Room?"}
                </h3>
                <p className="text-xs modal-sub">
                  {isHost ? `Permanently remove room #${room.roomCode}` : `Disconnect from #${room.roomCode}`}
                </p>
              </div>
            </div>

            <p className="text-xs modal-body leading-relaxed">
              {isHost ? (
                <>
                  Are you sure you want to permanently delete this room? This room will be closed and removed for all connected devices.
                </>
              ) : (
                <>
                  Are you sure you want to leave this room? You can reconnect anytime by entering the 6-digit code or scanning the QR code.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isLeaving}
                onClick={() => setIsLeaveModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold modal-cancel-btn transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isLeaving}
                onClick={handleConfirmLeave}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20 transition-all cursor-pointer"
              >
                {isLeaving
                  ? isHost
                    ? "Deleting..."
                    : "Leaving..."
                  : isHost
                  ? "Delete Room"
                  : "Leave Room"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Device Name Modal */}
      {isEditDeviceModalOpen && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl modal-card p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 animate-scale-up z-[100000] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-surface-hover">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold font-heading modal-title">Edit Device Name</h3>
                  <p className="text-xs modal-sub">Change how your device appears in this room</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditDeviceModalOpen(false)}
                className="p-1.5 rounded-xl text-ink-400 hover:text-ink-50 hover:bg-surface-hover transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {editDeviceError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                <p className="text-xs text-red-400 font-medium">{editDeviceError}</p>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const clean = editDeviceNameInput.trim();
                if (!clean) {
                  setEditDeviceError("Device name cannot be empty.");
                  return;
                }
                setIsUpdatingDeviceName(true);
                setEditDeviceError(null);
                try {
                  if (onUpdateDeviceName) {
                    await onUpdateDeviceName(clean);
                  }
                  setIsEditDeviceModalOpen(false);
                } catch (err: any) {
                  setEditDeviceError(err?.message || "Failed to update device name.");
                } finally {
                  setIsUpdatingDeviceName(false);
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-300">
                  Your Device Name
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={editDeviceNameInput}
                  onChange={(e) => setEditDeviceNameInput(e.target.value)}
                  placeholder="e.g. MacBook Pro, John's iPhone"
                  autoFocus
                  className="w-full rounded-xl bg-surface border border-surface-hover px-3.5 py-2 text-xs text-ink-50 focus:border-brand-500 focus:outline-hidden transition-colors"
                />
                <p className="text-[10px] text-ink-400 text-right font-mono">
                  {editDeviceNameInput.length}/50
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-hover">
                <button
                  type="button"
                  disabled={isUpdatingDeviceName}
                  onClick={() => setIsEditDeviceModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold modal-cancel-btn transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isUpdatingDeviceName || !editDeviceNameInput.trim()}
                  className="text-xs"
                >
                  {isUpdatingDeviceName ? "Saving..." : "Save Name"}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

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

"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { RoomSummary } from "@/types/room";
import { Button } from "@/components/ui/Button";
import { getDeviceDefaults } from "@/utils/device";

interface ActiveRoomsSelectorProps {
  activeRooms: RoomSummary[];
  currentRoomCode: string | null;
  onSwitchRoom: (roomCode: string) => Promise<void>;
  onCreateRoom: (customDeviceName?: string, customRoomName?: string) => Promise<string>;
  onJoinRoom: (roomCode: string, customDeviceName?: string) => Promise<string>;
  onLeaveRoom?: (roomCode: string) => Promise<void>;
}

export function ActiveRoomsSelector({
  activeRooms,
  currentRoomCode,
  onSwitchRoom,
  onCreateRoom,
  onJoinRoom,
}: ActiveRoomsSelectorProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const [newRoomName, setNewRoomName] = useState("");
  const [newDeviceName, setNewDeviceName] = useState(() => getDeviceDefaults().deviceName);
  const [joinCode, setJoinCode] = useState("");
  const [joinDeviceName, setJoinDeviceName] = useState(() => getDeviceDefaults().deviceName);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      await onCreateRoom(newDeviceName, newRoomName || "Live Room");
      setIsCreateModalOpen(false);
      setNewRoomName("");
    } catch (err: any) {
      setModalError(err?.message || "Failed to create room.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(joinCode.trim())) {
      setModalError("Please enter a valid 6-digit room code.");
      return;
    }
    setIsSubmitting(true);
    setModalError(null);
    try {
      await onJoinRoom(joinCode.trim(), joinDeviceName);
      setIsJoinModalOpen(false);
      setJoinCode("");
    } catch (err: any) {
      setModalError(err?.message || "Room not found or has expired.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="space-y-2">
      {/* Active Rooms Bar */}
      <div className="p-3 sm:p-3.5 rounded-2xl bg-surface/70 border border-surface-hover backdrop-blur-md space-y-2.5">
        {/* Top Header Row: Label & Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-ink-400 uppercase tracking-wider font-mono">
              Active Rooms
            </span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold font-mono bg-brand-500/15 text-brand-400 border border-brand-500/20">
              {activeRooms.length}
            </span>
          </div>

          {/* Desktop Actions */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setModalError(null);
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-100 bg-surface hover:bg-surface-hover border border-surface-hover hover:border-brand-500/30 transition-all cursor-pointer"
              title="Create another room without leaving current room"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Room</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setModalError(null);
                setIsJoinModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-100 bg-surface hover:bg-surface-hover border border-surface-hover hover:border-brand-500/30 transition-all cursor-pointer"
              title="Join another room code"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span>Join Another</span>
            </button>
          </div>

          {/* Mobile 3-Dot / Options Menu Button */}
          <div className="relative flex sm:hidden items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setModalError(null);
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ink-100 bg-surface hover:bg-surface-hover border border-surface-hover transition-all"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                className="p-1.5 rounded-xl text-ink-300 hover:text-ink-50 bg-surface hover:bg-surface-hover border border-surface-hover transition-colors"
                title="Room Options"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>

              {isMobileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[9990]"
                    onClick={() => setIsMobileMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 w-52 max-w-[calc(100vw-2rem)] rounded-2xl dropdown-card p-1.5 z-[9995] shadow-2xl ring-1 ring-black/10 dark:ring-white/10 animate-scale-up">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setModalError(null);
                        setIsCreateModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium dropdown-item transition-colors text-left"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400 shrink-0">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>Create New Room</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setModalError(null);
                        setIsJoinModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium dropdown-item transition-colors text-left"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400 shrink-0">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                      <span>Join Another Room</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Room Pills Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar w-full">
          {activeRooms.map((rm) => {
            const isActive = rm.roomCode === currentRoomCode;
            return (
              <button
                key={rm.roomCode}
                type="button"
                onClick={() => !isActive && onSwitchRoom(rm.roomCode)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                  isActive
                    ? "bg-brand-500 text-white shadow-md shadow-brand-500/25 border border-brand-400 cursor-default"
                    : "bg-surface hover:bg-surface-hover text-ink-200 hover:text-ink-50 border border-surface-hover cursor-pointer"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isActive ? "bg-white animate-pulse" : "bg-emerald-500"}`} />
                <span className="truncate max-w-[110px] sm:max-w-[160px] font-medium">
                  {rm.roomName || "Live Room"}
                </span>
                <span className={`font-mono text-[10px] ${isActive ? "text-white/80" : "text-ink-400"}`}>
                  #{rm.roomCode}
                </span>
                {rm.isHost && (
                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}>
                    Host
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Create New Room Modal */}
      {isCreateModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl modal-card p-6 shadow-2xl space-y-5 animate-scale-up z-[100000]">
            <div className="flex items-center justify-between pb-2 border-b border-surface-hover">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold font-heading modal-title">Create Another Room</h3>
                  <p className="text-xs modal-sub">Create independent room (e.g. Friends, Team)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-xl text-ink-400 hover:text-ink-50 hover:bg-surface-hover transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                <p className="text-xs text-red-400 font-medium">{modalError}</p>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-300">
                  Room Name (Optional)
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Company Team, Friends, Project Alpha"
                  className="w-full rounded-xl bg-surface border border-surface-hover px-3.5 py-2 text-xs text-ink-50 focus:border-brand-500 focus:outline-hidden transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-300">
                  Your Device Name
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. MacBook, iPhone"
                  className="w-full rounded-xl bg-surface border border-surface-hover px-3.5 py-2 text-xs text-ink-50 focus:border-brand-500 focus:outline-hidden transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-hover">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold modal-cancel-btn transition-colors"
                >
                  Cancel
                </button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs">
                  {isSubmitting ? "Creating..." : "Create Room"}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Join Another Room Modal */}
      {isJoinModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl modal-card p-6 shadow-2xl space-y-5 animate-scale-up z-[100000]">
            <div className="flex items-center justify-between pb-2 border-b border-surface-hover">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold font-heading modal-title">Join Another Room</h3>
                  <p className="text-xs modal-sub">Enter the 6-digit code to connect</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsJoinModalOpen(false)}
                className="p-1.5 rounded-xl text-ink-400 hover:text-ink-50 hover:bg-surface-hover transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                <p className="text-xs text-red-400 font-medium">{modalError}</p>
              </div>
            )}

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-300">
                  6-Digit Room Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 123456"
                  className="w-full rounded-xl bg-surface border border-surface-hover px-3.5 py-2 text-center text-sm font-mono tracking-widest text-ink-50 focus:border-brand-500 focus:outline-hidden transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-300">
                  Your Device Name
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={joinDeviceName}
                  onChange={(e) => setJoinDeviceName(e.target.value)}
                  placeholder="e.g. MacBook, iPhone"
                  className="w-full rounded-xl bg-surface border border-surface-hover px-3.5 py-2 text-xs text-ink-50 focus:border-brand-500 focus:outline-hidden transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-hover">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsJoinModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold modal-cancel-btn transition-colors"
                >
                  Cancel
                </button>
                <Button type="submit" size="sm" disabled={isSubmitting || joinCode.length !== 6} className="text-xs">
                  {isSubmitting ? "Joining..." : "Join Room"}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

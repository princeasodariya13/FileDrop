"use client";

import { useState, useEffect } from "react";
import { useMyUploads, MyUpload } from "@/hooks/useMyUploads";
import { formatBytes } from "@/utils/format";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteFileEarly } from "@/lib/api/files";
import { Card } from "@/components/ui/Card";

function getExpiryText(expiresAt: string, currentTime: number) {
  const remainingMs = new Date(expiresAt).getTime() - currentTime;
  if (remainingMs <= 0) return "expired";
  
  const totalMinutes = Math.max(1, Math.floor(remainingMs / 60000));
  
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (mins === 0) return `expires in ${hours}h`;
    return `expires in ${hours}h ${mins}m`;
  }
  
  return `expires in ${totalMinutes}m`;
}

function UploadItem({ upload, onRemove }: { upload: MyUpload, onRemove: (id: string) => void }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const expiryText = getExpiryText(upload.expiresAt, currentTime);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(upload.shareUrl);
      push("Link copied to clipboard", "success");
    } catch {
      push("Failed to copy link", "error");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteFileEarly(upload.fileId, upload.possessionToken);
      onRemove(upload.fileId);
      push("File permanently deleted", "success");
    } catch (err: any) {
      push(err.message || "Failed to delete file", "error");
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <Card className="p-4 bg-white/5 border border-white/10 relative overflow-hidden animate-fade-in-scale">
      <div className="flex flex-col gap-4">
        <div>
          <h4 className="text-sm font-medium text-ink-50 truncate">{upload.fileName}</h4>
          <div className="flex items-center gap-3 mt-1 text-xs text-ink-400 font-mono">
            <span>{formatBytes(upload.sizeBytes)}</span>
            <span>&bull;</span>
            <span className={expiryText === "expired" ? "text-red-400" : "text-brand-400"}>
              {expiryText}
            </span>
          </div>
        </div>

        {showConfirm ? (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-3">
            <p className="text-sm text-red-200">
              <strong className="text-red-400 block mb-1">Delete this file?</strong>
              This will permanently remove the file and make its shared link unavailable to new receivers.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowConfirm(false)} disabled={isDeleting} className="hover:bg-white/10">
                Cancel
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDelete} disabled={isDeleting} className="bg-red-500/20 text-red-400 hover:bg-red-500/30">
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/5">
            <Button size="sm" variant="ghost" onClick={handleCopyLink} className="text-brand-400 hover:text-brand-300 hover:bg-brand-500/10">
              Copy Link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowConfirm(true)} className="text-ink-400 hover:text-red-400 hover:bg-red-500/10">
              Delete
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function MyUploadsList() {
  const { uploads, removeUpload } = useMyUploads();

  if (uploads.length === 0) return null;

  return (
    <div className="space-y-4 mt-8">
      <h3 className="text-sm font-semibold text-ink-300 uppercase tracking-wider px-2">
        My Uploaded Files
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {uploads.map(upload => (
          <UploadItem key={upload.fileId} upload={upload} onRemove={removeUpload} />
        ))}
      </div>
    </div>
  );
}

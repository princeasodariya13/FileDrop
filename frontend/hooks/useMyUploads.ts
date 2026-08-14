import { useState, useEffect, useCallback } from "react";
import { CompleteUploadResponse } from "@/types/upload";

export interface MyUpload extends CompleteUploadResponse {
  uploadedAt: number;
}

export function useMyUploads() {
  const [uploads, setUploads] = useState<MyUpload[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("filedrop_my_uploads");
      if (stored) {
        const parsed = JSON.parse(stored) as MyUpload[];
        // Filter out expired uploads immediately on load
        const now = Date.now();
        const valid = parsed.filter(u => new Date(u.expiresAt).getTime() > now);
        if (valid.length !== parsed.length) {
          localStorage.setItem("filedrop_my_uploads", JSON.stringify(valid));
        }
        setUploads(valid);
      }
    } catch (err) {
      console.error("Failed to parse my uploads", err);
    }
  }, []);

  const addUpload = useCallback((upload: CompleteUploadResponse) => {
    setUploads(prev => {
      // Don't add duplicates
      if (prev.some(u => u.fileId === upload.fileId)) return prev;
      
      const newUploads = [{ ...upload, uploadedAt: Date.now() }, ...prev];
      localStorage.setItem("filedrop_my_uploads", JSON.stringify(newUploads));
      return newUploads;
    });
  }, []);

  const removeUpload = useCallback((fileId: string) => {
    setUploads(prev => {
      const newUploads = prev.filter(u => u.fileId !== fileId);
      localStorage.setItem("filedrop_my_uploads", JSON.stringify(newUploads));
      return newUploads;
    });
  }, []);

  // Cleanup effect: periodically remove expired entries
  useEffect(() => {
    const interval = setInterval(() => {
      setUploads(prev => {
        const now = Date.now();
        const valid = prev.filter(u => new Date(u.expiresAt).getTime() > now);
        if (valid.length !== prev.length) {
          localStorage.setItem("filedrop_my_uploads", JSON.stringify(valid));
          return valid;
        }
        return prev;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return { uploads, addUpload, removeUpload };
}

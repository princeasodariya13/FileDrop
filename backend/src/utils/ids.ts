import { customAlphabet } from "nanoid";

// Unambiguous, URL-safe alphabet — no 0/O/1/l confusion.
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const generateFileId = customAlphabet(alphabet, 12);
export const generateSessionId = customAlphabet(alphabet, 16);

export function generateTransferCode(): string {
  // Generate a random 6-digit number string between 100000 and 999999
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function sanitizeFilename(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.\- ]/g, "").trim();
  const trimmed = base.slice(0, 200) || "file";
  return trimmed;
}

export function buildStorageKey(fileId: string, sanitizedName: string): string {
  return `files/${fileId}/${sanitizedName}`;
}

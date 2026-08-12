import { customAlphabet } from "nanoid";

// Unambiguous, URL-safe alphabet — no 0/O/1/l confusion.
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const generateFileId = customAlphabet(alphabet, 12);
export const generateSessionId = customAlphabet(alphabet, 16);

export function sanitizeFilename(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.\- ]/g, "").trim();
  const trimmed = base.slice(0, 200) || "file";
  return trimmed;
}

export function buildR2Key(fileId: string, sanitizedName: string): string {
  return `files/${fileId}/${sanitizedName}`;
}

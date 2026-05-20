/**
 * assetService.ts - File Upload & Asset Storage Service
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 *
 * Handles file uploads with local storage.
 * Assets are stored in the uploads/ directory under the project root.
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), '..', 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '52428800', 10); // 50MB default
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
];

/**
 * Ensure upload directory exists
 */
export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('[AssetService] Created upload directory:', UPLOAD_DIR);
  }
}

/**
 * Validate file type and size
 */
export function validateFile(
  mimeType: string,
  fileSize: number
): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }
  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds maximum ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`,
    };
  }
  return { valid: true };
}

/**
 * Save an uploaded file buffer to disk
 * Returns the relative file path
 */
export async function saveFile(
  buffer: Buffer,
  originalName: string,
  userId: number
): Promise<{
  filePath: string;
  fileName: string;
  fileSize: number;
}> {
  ensureUploadDir();

  // Create user-specific subdirectory
  const userDir = path.join(UPLOAD_DIR, `user_${userId}`);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Generate unique filename to prevent collisions
  const ext = path.extname(originalName);
  const uniqueName = `${uuidv4()}${ext}`;
  const filePath = path.join(userDir, uniqueName);

  await fs.promises.writeFile(filePath, buffer);

  return {
    filePath: `uploads/user_${userId}/${uniqueName}`,
    fileName: originalName,
    fileSize: buffer.length,
  };
}

/**
 * Delete a file from disk
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const absolutePath = path.resolve(filePath);
    // Security: ensure path is within uploads directory
    if (!absolutePath.startsWith(path.resolve(UPLOAD_DIR))) {
      console.warn('[AssetService] Attempted to delete file outside uploads dir:', filePath);
      return false;
    }
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error('[AssetService] Failed to delete file:', err);
    return false;
  }
}

/**
 * Get the full filesystem path for serving files
 */
export function getAbsolutePath(relativePath: string): string {
  // If already absolute path within uploads, return as-is
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.resolve(UPLOAD_DIR, '..', relativePath);
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export { UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIME_TYPES };

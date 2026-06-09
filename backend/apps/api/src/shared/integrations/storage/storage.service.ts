import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface StorageUploadResult {
  url: string;
  thumbnailUrl?: string;
  key: string;
}

export interface StorageFile {
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
}

/** URL prefix under which stored files are served (see main.ts useStaticAssets). */
export const STORAGE_URL_PREFIX = '/local-storage';

/**
 * On-disk root for the local storage adapter. Files are written here keyed by
 * `key`, and main.ts serves this directory at STORAGE_URL_PREFIX so the URLs
 * returned by put() actually resolve.
 */
export const STORAGE_ROOT = path.join(process.cwd(), 'uploads', 'local-storage');

/**
 * StorageService — provider-agnostic storage port (profile photos, logos, thumbnails).
 * Local adapter: writes bytes to STORAGE_ROOT and returns a served URL; real
 * provider (S3/etc.) TBD (Q-01.04). Also keeps an in-memory index for tests.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  /** In-memory stored files for test assertions */
  readonly storedFiles: Array<{ key: string; file: StorageFile; result: StorageUploadResult }> = [];

  async put(file: StorageFile, prefix = 'uploads'): Promise<StorageUploadResult> {
    // Sanitize the original name to a safe path segment (avoid traversal / spaces).
    const safeName = path
      .basename(file.originalName)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${prefix}/${Date.now()}-${safeName}`;
    const url = `${STORAGE_URL_PREFIX}/${key}`;
    const ext = path.extname(safeName).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    const result: StorageUploadResult = {
      url,
      thumbnailUrl: isImage ? `${url}?thumb=1` : undefined,
      key,
    };

    // Persist the bytes to disk so the returned URL resolves when served.
    // Guard against a missing buffer (e.g. disk-storage multer config) so a
    // misconfiguration degrades gracefully instead of throwing a 500.
    if (Buffer.isBuffer(file.buffer)) {
      const destPath = path.join(STORAGE_ROOT, key);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, file.buffer);
    } else {
      this.logger.warn(
        `[STORAGE LOCAL ADAPTER] No buffer for ${key} — file NOT persisted (check multer storage config)`,
      );
    }

    this.storedFiles.push({ key, file, result });
    this.logger.log(`[STORAGE LOCAL ADAPTER] Stored: ${key} (${file.size} bytes)`);
    return result;
  }

  async delete(key: string): Promise<void> {
    const idx = this.storedFiles.findIndex((f) => f.key === key);
    if (idx !== -1) {
      this.storedFiles.splice(idx, 1);
    }
    // Best-effort disk removal — ignore if the file is already gone.
    try {
      await fs.unlink(path.join(STORAGE_ROOT, key));
    } catch {
      /* file may not exist (e.g. test-only entries) */
    }
    this.logger.log(`[STORAGE LOCAL ADAPTER] Deleted: ${key}`);
  }
}

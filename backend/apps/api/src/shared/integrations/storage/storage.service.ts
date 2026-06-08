import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';

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

/**
 * StorageService — provider-agnostic storage port (profile photos, logos, thumbnails).
 * Local adapter: stores metadata in-memory for dev/test; real provider TBD (Q-01.04).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  /** In-memory stored files for test assertions */
  readonly storedFiles: Array<{ key: string; file: StorageFile; result: StorageUploadResult }> = [];

  async put(file: StorageFile, prefix = 'uploads'): Promise<StorageUploadResult> {
    const key = `${prefix}/${Date.now()}-${file.originalName}`;
    const url = `/local-storage/${key}`;
    const ext = path.extname(file.originalName).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    const result: StorageUploadResult = {
      url,
      thumbnailUrl: isImage ? `${url}?thumb=1` : undefined,
      key,
    };

    this.storedFiles.push({ key, file, result });
    this.logger.log(
      `[STORAGE DEV ADAPTER] Stored: ${key} (${file.size} bytes)`,
    );
    return result;
  }

  async delete(key: string): Promise<void> {
    const idx = this.storedFiles.findIndex((f) => f.key === key);
    if (idx !== -1) {
      this.storedFiles.splice(idx, 1);
    }
    this.logger.log(`[STORAGE DEV ADAPTER] Deleted: ${key}`);
  }
}

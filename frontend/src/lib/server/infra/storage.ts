import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '$env/dynamic/private';

export interface StorageService {
  save(key: string, data: Buffer | Uint8Array): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorageService implements StorageService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async save(key: string, data: Buffer | Uint8Array): Promise<string> {
    const fullPath = join(this.basePath, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const fullPath = join(this.basePath, key);
    return readFile(fullPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = join(this.basePath, key);
    await unlink(fullPath);
  }
}

let instance: StorageService | null = null;

export function getStorage(): StorageService {
  if (!instance) {
    const basePath = env.STORAGE_PATH || './storage';
    instance = new LocalStorageService(basePath);
  }
  return instance;
}

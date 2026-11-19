import fs from "node:fs/promises";
import path from "node:path";

import { AwsClient } from "aws4fetch";

/**
 * Приватное хранилище фото. Ключи — случайные UUID, наружу не отдаются.
 * local — файлы рядом с приложением (VPS), s3 — приватный бакет (R2/S3).
 */
export type StoredObject = { data: Buffer; contentType: string };

export type PhotoStorage = {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
};

const KEY_PATTERN = /^[a-f0-9-]{36}\.webp$/;

export function isStorageKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

class LocalStorage implements PhotoStorage {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  private resolve(key: string): string {
    if (!isStorageKey(key)) throw new Error("Некорректный ключ файла");
    return path.join(this.dir, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data, { mode: 0o600 });
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const data = await fs.readFile(this.resolve(key));
      return { data, contentType: "image/webp" };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // файла уже нет — это не ошибка
    }
  }
}

class S3Storage implements PhotoStorage {
  private readonly client: AwsClient;
  private readonly endpoint: string;
  private readonly bucket: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "Для PHOTO_STORAGE=s3 нужны S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.",
      );
    }

    this.endpoint = endpoint.replace(/\/$/, "");
    this.bucket = bucket;
    this.client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: process.env.S3_REGION ?? "auto",
      service: "s3",
    });
  }

  private url(key: string): string {
    if (!isStorageKey(key)) throw new Error("Некорректный ключ файла");
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const response = await this.client.fetch(this.url(key), {
      method: "PUT",
      body: new Uint8Array(data),
      headers: { "Content-Type": contentType },
    });
    if (!response.ok) {
      throw new Error(`S3 PUT ${response.status}`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.client.fetch(this.url(key));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`S3 GET ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    return {
      data,
      contentType: response.headers.get("content-type") ?? "image/webp",
    };
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.url(key), { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 DELETE ${response.status}`);
    }
  }
}

export class MemoryStorage implements PhotoStorage {
  readonly objects = new Map<string, StoredObject>();

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { data, contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

let cached: PhotoStorage | null = null;

export function getStorage(): PhotoStorage {
  if (cached) return cached;
  cached =
    process.env.PHOTO_STORAGE === "s3"
      ? new S3Storage()
      : new LocalStorage(process.env.PHOTO_STORAGE_DIR ?? ".data/uploads");
  return cached;
}

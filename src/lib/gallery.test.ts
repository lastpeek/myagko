import fs from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getGalleryImage } from "@/app/api/gallery/[id]/route";
import { GET as getGalleryBeforeImage } from "@/app/api/gallery/[id]/before/route";
import { closeDb, getDb, runMigrations } from "@/lib/db";
import {
  createGalleryPhotos,
  deleteGalleryPhoto,
  GALLERY_LIMIT,
  GalleryError,
  getGalleryPhoto,
  getPublicGalleryPhoto,
  listGalleryPhotos,
  removeGalleryBeforePhoto,
  setGalleryBeforePhoto,
  updateGalleryPhoto,
} from "@/lib/gallery";
import { getStorage } from "@/lib/storage";
import type { NormalizedPhoto } from "@/lib/image";

const DB_PATH = path.join(process.cwd(), ".data", "gallery-test");
const UPLOADS = path.join(process.cwd(), ".data", "gallery-test-uploads");

process.env.DATABASE_URL = `pglite://${DB_PATH}`;
process.env.PHOTO_STORAGE = "local";
process.env.PHOTO_STORAGE_DIR = UPLOADS;

function photo(index: number): NormalizedPhoto {
  const data = Buffer.from(`gallery-photo-${index}`);
  return {
    data,
    mime: "image/webp",
    width: 10,
    height: 10,
    bytes: data.length,
  };
}

async function storedFiles(): Promise<string[]> {
  try {
    return await fs.readdir(UPLOADS);
  } catch {
    return [];
  }
}

beforeAll(async () => {
  await fs.rm(DB_PATH, { recursive: true, force: true });
  await fs.rm(UPLOADS, { recursive: true, force: true });
  await runMigrations();
});

afterAll(async () => {
  await closeDb();
  await fs.rm(DB_PATH, { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(UPLOADS, { recursive: true, force: true }).catch(() => undefined);
});

describe("галерея работ", () => {
  it("на чистой базе таблица пустая и миграция применена", async () => {
    const photos = await listGalleryPhotos(getDb());
    expect(photos).toEqual([]);
  });

  it("загружает фото, сохраняет объекты и порядок", async () => {
    const created = await createGalleryPhotos(getDb(), [
      photo(1),
      photo(2),
      photo(3),
    ]);

    expect(created).toHaveLength(3);
    expect(created.map((row) => row.sortOrder)).toEqual([10, 20, 30]);
    expect(created.every((row) => row.isVisible)).toBe(true);
    expect(await storedFiles()).toHaveLength(3);

    const listed = await listGalleryPhotos(getDb());
    expect(listed.map((row) => row.id)).toEqual(created.map((row) => row.id));
  });

  it("меняет подпись и видимость, скрытое не отдаётся публично", async () => {
    const db = getDb();
    const [first] = await listGalleryPhotos(db);

    expect(
      await updateGalleryPhoto(db, first!.id, {
        caption: "  Диван после чистки  ",
      }),
    ).toBe(true);

    const updated = await getGalleryPhoto(db, first!.id);
    expect(updated?.caption).toBe("Диван после чистки");

    await updateGalleryPhoto(db, first!.id, { isVisible: false });
    expect(await getPublicGalleryPhoto(db, first!.id)).toBeNull();

    const visible = await listGalleryPhotos(db, { visibleOnly: true });
    expect(visible.some((row) => row.id === first!.id)).toBe(false);
    expect(visible).toHaveLength(2);

    await updateGalleryPhoto(db, first!.id, { isVisible: true });
    expect(await getPublicGalleryPhoto(db, first!.id)).not.toBeNull();
  });

  it("меняет порядок стрелками", async () => {
    const db = getDb();
    const before = await listGalleryPhotos(db);
    const last = before[before.length - 1]!;

    expect(await updateGalleryPhoto(db, last.id, { move: "up" })).toBe(true);

    const after = await listGalleryPhotos(db);
    expect(after[1]?.id).toBe(last.id);

    // Верхняя позиция не двигается выше
    const first = after[0]!;
    expect(await updateGalleryPhoto(db, first.id, { move: "up" })).toBe(true);
    const unchanged = await listGalleryPhotos(db);
    expect(unchanged[0]?.id).toBe(first.id);
  });

  it("загружает и убирает фото «до», скрытая позиция даёт 404 на оба файла", async () => {
    const db = getDb();
    const [target] = await listGalleryPhotos(db);
    const filesBefore = (await storedFiles()).length;

    expect(await setGalleryBeforePhoto(db, target!.id, photo(77))).toBe(true);

    const withBefore = await getGalleryPhoto(db, target!.id);
    expect(withBefore?.beforeStorageKey).toBeTruthy();
    expect((await storedFiles()).length).toBe(filesBefore + 1);

    const beforeResponse = await getGalleryBeforeImage(
      new Request(`http://localhost:3000/api/gallery/${target!.id}/before`),
      { params: Promise.resolve({ id: target!.id }) },
    );
    expect(beforeResponse.status).toBe(200);

    await updateGalleryPhoto(db, target!.id, { isVisible: false });

    const hiddenAfter = await getGalleryImage(
      new Request(`http://localhost:3000/api/gallery/${target!.id}`),
      { params: Promise.resolve({ id: target!.id }) },
    );
    const hiddenBefore = await getGalleryBeforeImage(
      new Request(`http://localhost:3000/api/gallery/${target!.id}/before`),
      { params: Promise.resolve({ id: target!.id }) },
    );
    expect(hiddenAfter.status).toBe(404);
    expect(hiddenBefore.status).toBe(404);

    await updateGalleryPhoto(db, target!.id, { isVisible: true });
    expect(await removeGalleryBeforePhoto(db, target!.id)).toBe(true);
    expect((await getGalleryPhoto(db, target!.id))?.beforeStorageKey).toBeNull();
    expect((await storedFiles()).length).toBe(filesBefore);
  });

  it("публичный роут отдаёт видимое фото и 404 для скрытого", async () => {    const db = getDb();
    const [first] = await listGalleryPhotos(db);
    const storage = getStorage();

    const visible = await getGalleryImage(
      new Request(`http://localhost:3000/api/gallery/${first!.id}`),
      { params: Promise.resolve({ id: first!.id }) },
    );
    expect(visible.status).toBe(200);
    expect(visible.headers.get("content-type")).toBe("image/webp");
    const body = Buffer.from(await visible.arrayBuffer());
    const stored = await storage.get(first!.storageKey);
    expect(body.equals(stored!.data)).toBe(true);

    await updateGalleryPhoto(db, first!.id, { isVisible: false });
    const hidden = await getGalleryImage(
      new Request(`http://localhost:3000/api/gallery/${first!.id}`),
      { params: Promise.resolve({ id: first!.id }) },
    );
    expect(hidden.status).toBe(404);
    await updateGalleryPhoto(db, first!.id, { isVisible: true });

    const unknown = await getGalleryImage(
      new Request("http://localhost:3000/api/gallery/00000000-0000-4000-8000-000000000000"),
      {
        params: Promise.resolve({
          id: "00000000-0000-4000-8000-000000000000",
        }),
      },
    );
    expect(unknown.status).toBe(404);

    const broken = await getGalleryImage(
      new Request("http://localhost:3000/api/gallery/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(broken.status).toBe(404);
  });

  it("удаление убирает строку и оба файла", async () => {
    const db = getDb();
    const [first] = await listGalleryPhotos(db);
    await setGalleryBeforePhoto(db, first!.id, photo(88));
    const filesBefore = (await storedFiles()).length;

    expect(await deleteGalleryPhoto(db, first!.id)).toBe(true);
    expect(await getGalleryPhoto(db, first!.id)).toBeNull();
    expect((await storedFiles()).length).toBe(filesBefore - 2);
  });

  it("не даёт превысить лимит в 24 фото", async () => {
    const db = getDb();
    const current = await listGalleryPhotos(db);
    const remaining = GALLERY_LIMIT - current.length;

    if (remaining > 0) {
      await createGalleryPhotos(
        db,
        Array.from({ length: remaining }, (_, index) => photo(100 + index)),
      );
    }

    expect(await listGalleryPhotos(db)).toHaveLength(GALLERY_LIMIT);

    await expect(createGalleryPhotos(db, [photo(999)])).rejects.toBeInstanceOf(
      GalleryError,
    );
  });
});

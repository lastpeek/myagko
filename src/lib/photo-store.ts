"use client";

/**
 * Фото живут в IndexedDB до отправки заявки: переживают перезагрузку,
 * на сервер не уходят из корзины (никаких сирот).
 */

export type StoredPhoto = {
  id: string;
  itemUid: string;
  blob: Blob;
  width: number;
  height: number;
  name: string;
  createdAt: number;
};

const DB_NAME = "myagko-photos";
const STORE = "photos";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен"));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("itemUid", "itemUid", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB"));
  });
  return dbPromise;
}

export async function putPhoto(photo: StoredPhoto): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(photo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Не удалось сохранить фото"));
  });
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // фото уже нет
  }
}

export async function deletePhotosByItem(itemUid: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const index = tx.objectStore(STORE).index("itemUid");
      const request = index.openCursor(IDBKeyRange.only(itemUid));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

export async function clearPhotos(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

export async function getPhoto(id: string): Promise<StoredPhoto | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as StoredPhoto) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function listPhotos(): Promise<StoredPhoto[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () =>
        resolve((request.result as StoredPhoto[]) ?? []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Чистит записи, которых больше нет в корзине (например, после сброса). */
export async function prunePhotos(keepIds: Set<string>): Promise<void> {
  const photos = await listPhotos();
  await Promise.all(
    photos.filter((photo) => !keepIds.has(photo.id)).map((photo) => deletePhoto(photo.id)),
  );
}

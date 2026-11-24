"use client";

export type GalleryDraft = {
  id: string;
  file: Blob;
  fileName: string;
  createdAt: number;
};

const DB_NAME = "myagko-gallery";
const STORE_NAME = "drafts";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB"));
  });
}

export async function putGalleryDraft(draft: GalleryDraft): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("draft"));
  });
  db.close();
}

export async function listGalleryDrafts(): Promise<GalleryDraft[]> {
  const db = await openDb();
  const drafts = await new Promise<GalleryDraft[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as GalleryDraft[]);
    request.onerror = () => reject(request.error ?? new Error("draft"));
  });
  db.close();
  return drafts.sort((left, right) => left.createdAt - right.createdAt);
}

export async function deleteGalleryDraft(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("draft"));
  });
  db.close();
}

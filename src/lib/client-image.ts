"use client";

import { sniffImageType, ACCEPTED_IMAGE_TYPES } from "@/lib/image-sniff";

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1600;
const QUALITY = 0.8;

export type PreparedPhoto = {
  blob: Blob;
  width: number;
  height: number;
};

export type PrepareResult =
  | { ok: true; photo: PreparedPhoto }
  | { ok: false; error: string };

/**
 * Быстрая проверка на клиенте и сжатие до ≤1600px.
 * Сервер всё равно проверяет тип по сигнатуре и перекодирует.
 */
export async function preparePhoto(file: File): Promise<PrepareResult> {
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: "Файл больше 10 МБ. Сожмите или выберите другой." };
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImageType(header)) {
    return { ok: false, error: `Нужен ${ACCEPTED_IMAGE_TYPES}.` };
  }

  if (typeof createImageBitmap !== "function") {
    return {
      ok: true,
      photo: { blob: file, width: 0, height: 0 },
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error("encode");

    return { ok: true, photo: { blob, width, height } };
  } catch {
    return { ok: false, error: "Файл не открывается. Попробуйте другой." };
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", QUALITY);
      },
      "image/webp",
      QUALITY,
    );
  });
}

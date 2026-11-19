import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const width = 480;
const height = 360;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#E3EFE9"/>
  <rect x="40" y="60" width="${width - 80}" height="${height - 120}" rx="28" fill="#155C4C"/>
  <rect x="70" y="90" width="${width - 140}" height="60" rx="18" fill="#F7F4EF" opacity="0.35"/>
  <circle cx="${width - 90}" cy="${height - 90}" r="18" fill="#F7F4EF" opacity="0.5"/>
</svg>`;

async function main() {
  const out = path.join(process.cwd(), "e2e", "fixtures", "photo.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log("Фото-фикстура:", out);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

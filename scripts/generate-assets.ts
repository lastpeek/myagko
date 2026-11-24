import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icons");
const ACCENT = "#155C4C";
const PAPER = "#F7F4EF";
const INK = "#191714";
const INK_2 = "#6D665C";

const SOFA_PATHS = [
  "M3 17v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4",
  "M3 17h18",
  "M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3",
  "M6 20v-3M18 20v-3",
];

function glyph(transform: string, color: string, width = 1.6): string {
  return `<g transform="${transform}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${SOFA_PATHS.map(
    (d) => `<path d="${d}"/>`,
  ).join("")}</g>`;
}

function iconSvg(size: number, glyphRatio: number): string {
  const box = size * glyphRatio;
  const scale = box / 24;
  const offset = (size - box) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${ACCENT}"/>
  ${glyph(`translate(${offset} ${offset}) scale(${scale})`, "#FFFFFF")}
</svg>`;
}

function ogSvg(): string {
  const tile = 120;
  const scale = 72 / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="0.5" y="0.5" width="1199" height="629" fill="none" stroke="#E4DED4"/>
  <rect x="80" y="80" width="${tile}" height="${tile}" rx="30" fill="${ACCENT}"/>
  ${glyph(`translate(${80 + (tile - 72) / 2} ${80 + (tile - 72) / 2}) scale(${scale})`, "#FFFFFF")}
  <text x="224" y="140" font-family="Onest, Segoe UI, Arial, sans-serif" font-size="40" font-weight="600" fill="${INK}">Мягко</text>
  <text x="224" y="180" font-family="Onest, Segoe UI, Arial, sans-serif" font-size="24" fill="${INK_2}">Новосибирск</text>
  <text x="80" y="330" font-family="Onest, Segoe UI, Arial, sans-serif" font-size="64" font-weight="600" fill="${INK}">Химчистка мягкой</text>
  <text x="80" y="406" font-family="Onest, Segoe UI, Arial, sans-serif" font-size="64" font-weight="600" fill="${INK}">мебели с выездом</text>
  <text x="80" y="470" font-family="Onest, Segoe UI, Arial, sans-serif" font-size="26" fill="${INK_2}">Предварительная цена сразу. Точную мастер подтвердит после фото.</text>
  <rect x="80" y="520" width="1040" height="1" fill="#E4DED4"/>
  <text x="80" y="566" font-family="Onest, Segoe UI, Arial, sans-serif" font-size="24" fill="${INK_2}">Диваны · кресла · матрасы · стулья</text>
  <text x="1120" y="566" text-anchor="end" font-family="Onest, Segoe UI, Arial, sans-serif" font-size="24" fill="${ACCENT}">Заявка за пару минут</text>
</svg>`;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const targets = [
    { name: "icon-192.png", size: 192, ratio: 0.62 },
    { name: "icon-512.png", size: 512, ratio: 0.62 },
    { name: "maskable-512.png", size: 512, ratio: 0.5 },
    { name: "apple-icon.png", size: 180, ratio: 0.62 },
  ];

  for (const target of targets) {
    await sharp(Buffer.from(iconSvg(target.size, target.ratio)))
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, target.name));
  }

  await sharp(Buffer.from(ogSvg()))
    .png({ compressionLevel: 9 })
    .toFile(path.join(process.cwd(), "public", "og.png"));

  await fs.writeFile(
    path.join(OUT, "icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="${ACCENT}"/>
  ${glyph(`translate(${(64 - 40) / 2} ${(64 - 40) / 2}) scale(${40 / 24})`, "#FFFFFF")}
</svg>`,
  );

  console.log("Иконки и OG-картинка собраны в public/.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

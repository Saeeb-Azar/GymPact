// Erzeugt die PWA-Icons (PNG) ohne externe Abhängigkeiten:
// abgerundetes Quadrat in Markenfarbe mit Fortschrittsring-Motiv.
// Aufruf: npm run icons

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- PNG-Encoder
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 6; // RGBA
  // Scanlines mit Filter 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- Zeichnen
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Rendert das Icon:
 *  - Hintergrund: Markengrün, optional abgerundete Ecken
 *  - Motiv: heller Fortschrittsring (ca. 300°) mit Punkt am Ende
 */
function renderIcon(size, { rounded }) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [38, 125, 96]; // brand-600
  const bgDark = [24, 66, 54]; // brand-900, leichter radialer Verlauf
  const fg = [255, 255, 255];

  const center = size / 2;
  const cornerRadius = rounded ? size * 0.22 : 0;
  const ringRadius = size * 0.28;
  const ringWidth = size * 0.09;
  const arcStart = -Math.PI / 2; // oben
  const arcSweep = (300 / 180) * Math.PI;
  const aa = Math.max(1, size / 256);

  // Endpunkt des Bogens (für den "aktuellen Stand"-Punkt)
  const endAngle = arcStart + arcSweep;
  const dotX = center + ringRadius * Math.cos(endAngle);
  const dotY = center + ringRadius * Math.sin(endAngle);
  const dotRadius = ringWidth * 0.72;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      // Alpha der abgerundeten Kachel
      let alpha = 1;
      if (cornerRadius > 0) {
        const qx = Math.abs(px - center) - (center - cornerRadius);
        const qy = Math.abs(py - center) - (center - cornerRadius);
        const dist =
          Math.min(Math.max(qx, qy), 0) +
          Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
          cornerRadius;
        alpha = 1 - smoothstep(-aa, aa, dist);
      }
      if (alpha <= 0) continue;

      // Hintergrund mit dezentem radialen Verlauf
      const dx = px - center;
      const dy = py - center;
      const r = Math.hypot(dx, dy);
      const t = Math.min(1, r / (size * 0.75));
      let [cr, cg, cb] = [
        bg[0] + (bgDark[0] - bg[0]) * t * 0.6,
        bg[1] + (bgDark[1] - bg[1]) * t * 0.6,
        bg[2] + (bgDark[2] - bg[2]) * t * 0.6,
      ];

      // Fortschrittsring
      let angle = Math.atan2(dy, dx);
      let rel = angle - arcStart;
      while (rel < 0) rel += Math.PI * 2;
      const onArc = rel <= arcSweep;
      const ringDist = Math.abs(r - ringRadius) - ringWidth / 2;
      let fgMix = onArc ? 1 - smoothstep(-aa, aa, ringDist) : 0;

      // runde Bogen-Enden + Punkt am Ende
      const startX = center + ringRadius * Math.cos(arcStart);
      const startY = center + ringRadius * Math.sin(arcStart);
      const capStart =
        1 - smoothstep(-aa, aa, Math.hypot(px - startX, py - startY) - ringWidth / 2);
      const dot = 1 - smoothstep(-aa, aa, Math.hypot(px - dotX, py - dotY) - dotRadius);
      fgMix = Math.max(fgMix, capStart, dot);

      if (fgMix > 0) {
        cr = cr + (fg[0] - cr) * fgMix;
        cg = cg + (fg[1] - cg) * fgMix;
        cb = cb + (fg[2] - cb) * fgMix;
      }

      rgba[idx] = Math.round(cr);
      rgba[idx + 1] = Math.round(cg);
      rgba[idx + 2] = Math.round(cb);
      rgba[idx + 3] = Math.round(alpha * 255);
    }
  }
  return rgba;
}

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
  { file: 'maskable-512.png', size: 512, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false },
];

for (const { file, size, rounded } of targets) {
  const png = encodePng(size, renderIcon(size, { rounded }));
  writeFileSync(join(outDir, file), png);
  console.log(`✓ ${file} (${size}×${size}, ${png.length} Bytes)`);
}

#!/usr/bin/env node
// Erzeugt public/body/body.bin – das 3D-Körpermodell für die Muskelkarte.
//
// Quelle: MakeHuman-Basismesh, Morph-Targets und Skelett-Gewichte
// (alle CC0, https://github.com/makehumancommunity/makehuman).
// Die Rohdateien vorher in einen Ordner laden:
//
//   B=https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data
//   curl -O $B/3dobjs/base.obj
//   curl -O $B/rigs/default_weights.mhw
//   for t in caucasian-male-young caucasian-female-young \
//            universal-male-young-maxmuscle-averageweight universal-female-young-maxmuscle-averageweight; do
//     curl -o $t.target $B/targets/macrodetails/$t.target; done
//   curl -o prop-male.target   $B/targets/macrodetails/proportions/male-young-averagemuscle-averageweight-idealproportions.target
//   curl -o prop-female.target $B/targets/macrodetails/proportions/female-young-averagemuscle-averageweight-idealproportions.target
//
//   node scripts/build-body-model.mjs <ordner>
//
// Ausgabe (little endian):
//   "GPB1" | nV u32 | nI u32 | min 3f32 | max 3f32 | eyeL 3f32 | eyeR 3f32 | eyeR f32
//   | posMale int16[nV*3] | posFemale int16[nV*3] | groups u8[nV] (+pad auf 4) | idx u16[nI]
// Positionen sind auf die gemeinsame Bounding-Box quantisiert.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('Aufruf: node scripts/build-body-model.mjs <ordner-mit-makehuman-dateien>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Reihenfolge = Gruppen-IDs 1..12 (0 = keine Muskelgruppe). Muss zu BodyScene3D passen.
export const GROUPS = [
  'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs',
  'back', 'traps', 'glutes', 'quads', 'hamstrings', 'calves',
];
const G = Object.fromEntries(GROUPS.map((g, i) => [g, i + 1]));

// ---------------------------------------------------------------- OBJ lesen
const verts = [];
const bodyFaces = [];
const groupVerts = new Map();
let group = '';
for (const line of readFileSync(join(src, 'base.obj'), 'utf8').split('\n')) {
  if (line.startsWith('v ')) {
    const [, x, y, z] = line.trim().split(/\s+/);
    verts.push([+x, +y, +z]);
  } else if (line.startsWith('g ')) {
    group = line.slice(2).trim();
  } else if (line.startsWith('f ')) {
    const idx = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t.split('/')[0], 10) - 1);
    if (group === 'body') bodyFaces.push(idx);
    const set = groupVerts.get(group) ?? new Set();
    idx.forEach((i) => set.add(i));
    groupVerts.set(group, set);
  }
}

// ---------------------------------------------------------------- Morphs
function readTarget(name) {
  const d = new Map();
  for (const line of readFileSync(join(src, name), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [i, x, y, z] = line.trim().split(/\s+/).map(Number);
    d.set(i, [x, y, z]);
  }
  return d;
}
function morph(targets) {
  const out = verts.map((v) => v.slice());
  for (const [name, w] of targets) {
    for (const [i, [x, y, z]] of readTarget(name)) {
      out[i][0] += x * w;
      out[i][1] += y * w;
      out[i][2] += z * w;
    }
  }
  return out;
}
const male = morph([
  ['caucasian-male-young.target', 1],
  ['universal-male-young-maxmuscle-averageweight.target', 1],
  ['prop-male.target', 0.6],
]);
const female = morph([
  ['caucasian-female-young.target', 1],
  ['universal-female-young-maxmuscle-averageweight.target', 0.6],
  ['prop-female.target', 0.6],
]);

// ---------------------------------------------------------------- Normalen (Basismesh)
const normals = verts.map(() => [0, 0, 0]);
for (const f of bodyFaces) {
  for (let k = 1; k + 1 < f.length; k++) {
    const [a, b, c] = [verts[f[0]], verts[f[k]], verts[f[k + 1]]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [f[0], f[k], f[k + 1]]) {
      normals[i][0] += n[0];
      normals[i][1] += n[1];
      normals[i][2] += n[2];
    }
  }
}
for (const n of normals) {
  const l = Math.hypot(...n) || 1;
  n[0] /= l;
  n[1] /= l;
  n[2] /= l;
}

// ---------------------------------------------------------------- Muskelgruppen
const weights = JSON.parse(readFileSync(join(src, 'default_weights.mhw'), 'utf8')).weights;
const dominant = new Map();
for (const [bone, list] of Object.entries(weights)) {
  for (const [i, w] of list) {
    const cur = dominant.get(i);
    if (!cur || w > cur[1]) dominant.set(i, [bone, w]);
  }
}

function classify(i) {
  const bone = (dominant.get(i)?.[0] ?? '').replace(/\.(L|R)$/, '');
  const [, y] = verts[i];
  const [nx, , nz] = normals[i];
  const front = nz > 0.2;
  const back = nz < -0.2;
  const side = !front && !back;
  switch (bone) {
    case 'breast':
      return G.chest;
    case 'shoulder01':
      return G.shoulders;
    case 'clavicle':
      return back || y > 5.6 ? G.traps : G.chest;
    case 'neck01':
    case 'neck02':
      return nz < 0 && y < 6.4 ? G.traps : 0;
    case 'spine01':
      if (front) return y < 5.35 ? G.chest : 0;
      if (back) return y > 4.9 ? G.traps : G.back;
      return y > 4.8 ? G.traps : G.back;
    case 'spine02':
      if (front) return y > 3.5 ? G.chest : G.abs;
      if (back) return G.back;
      return y > 3.4 && Math.abs(nx) > 0.5 ? G.back : G.abs;
    case 'spine03':
    case 'spine04':
      return back ? G.back : G.abs;
    case 'spine05':
      if (back) return y < 0.8 ? G.glutes : G.back;
      return front && y > 0.25 ? G.abs : 0;
    case 'pelvis':
      if (back) return G.glutes;
      return front && y > 0.7 ? G.abs : side ? G.glutes : 0;
    case 'upperarm01':
      if (y > 4.95) return G.shoulders;
      return nz >= 0 ? G.biceps : G.triceps;
    case 'upperarm02':
      return nz >= 0 ? G.biceps : G.triceps;
    case 'lowerarm01':
    case 'lowerarm02':
    case 'wrist':
      return G.forearms;
    case 'upperleg01':
      if (back) return y > -0.7 ? G.glutes : G.hamstrings;
      return G.quads;
    case 'upperleg02':
      return nz < -0.15 ? G.hamstrings : G.quads;
    case 'lowerleg01':
    case 'lowerleg02':
      return nz < 0.1 ? G.calves : 0;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------- Kompaktes Mesh
const remap = new Map();
const used = [];
for (const f of bodyFaces) for (const i of f) if (!remap.has(i)) { remap.set(i, used.length); used.push(i); }
const tris = [];
for (const f of bodyFaces) {
  for (let k = 1; k + 1 < f.length; k++) tris.push(remap.get(f[0]), remap.get(f[k]), remap.get(f[k + 1]));
}
const nV = used.length;
if (nV > 65535) throw new Error('Zu viele Vertices für Uint16');

const centroid = (pos, name) => {
  const s = [...(groupVerts.get(name) ?? [])];
  const c = [0, 0, 0];
  for (const i of s) for (let k = 0; k < 3; k++) c[k] += pos[i][k] / s.length;
  return c;
};
const eyeL = centroid(male, 'joint-l-eye');
const eyeR = centroid(male, 'joint-r-eye');

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const pos of [male, female]) {
  for (const i of used) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], pos[i][k]);
    max[k] = Math.max(max[k], pos[i][k]);
  }
}

const quant = (pos) => {
  const a = new Int16Array(nV * 3);
  used.forEach((i, j) => {
    for (let k = 0; k < 3; k++) {
      const t = (pos[i][k] - min[k]) / (max[k] - min[k]);
      a[j * 3 + k] = Math.round(t * 65534 - 32767);
    }
  });
  return a;
};
const groups = new Uint8Array(Math.ceil(nV / 4) * 4);
used.forEach((i, j) => (groups[j] = classify(i)));

const header = new ArrayBuffer(4 + 8 + 4 * 13);
const hv = new DataView(header);
[..."GPB1"].forEach((ch, i) => hv.setUint8(i, ch.charCodeAt(0)));
hv.setUint32(4, nV, true);
hv.setUint32(8, tris.length, true);
[...min, ...max, ...eyeL, ...eyeR, 0.12].forEach((v, i) => hv.setFloat32(12 + i * 4, v, true));

const out = Buffer.concat([
  Buffer.from(header),
  Buffer.from(quant(male).buffer),
  Buffer.from(quant(female).buffer),
  Buffer.from(groups.buffer),
  Buffer.from(new Uint16Array(tris).buffer),
]);
mkdirSync(join(root, 'public/body'), { recursive: true });
writeFileSync(join(root, 'public/body/body.bin'), out);

const counts = GROUPS.map((g, i) => `${g}:${groups.filter((x) => x === i + 1).length}`).join(' ');
console.log(`body.bin: ${nV} Vertices, ${tris.length / 3} Dreiecke, ${(out.length / 1024).toFixed(0)} KB`);
console.log(counts);

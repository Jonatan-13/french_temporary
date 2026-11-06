// Comprime las imágenes: lee los originales de images-src/ y escribe en images/
// versiones WebP de máx. 1200 px (suficiente para el dialog, que se ve a ~560 px).
//
// Uso:
//   node optimize-images.mjs
//
// - Primera vez: si images/ tiene fotos y images-src/ no existe, mueve esas fotos
//   (tus originales) a images-src/ y las convierte. No se borra nada.
// - Después: copia/pega originales nuevos en images-src/ (nombre = id de la palabra,
//   ej. images-src/fleur.jpg) y vuelve a ejecutar. Solo procesa lo nuevo o modificado.
// - Al terminar, ejecuta `node sync.mjs` para que data.js detecte las imágenes.
//
// Necesita `npm install` (una vez) para instalar sharp.

import { readdir, mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'images-src');
const OUT = join(here, 'images');
const RASTER = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff']);
const MAX = 1200; // px, lado mayor
const QUALITY = 78;

const ext = (f) => parse(f).ext.slice(1).toLowerCase();
const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
const mtime = (p) => stat(p).then((s) => s.mtimeMs, () => 0);

// Primera vez: adoptar los originales que ya están en images/
let adopted = false;
try {
  await stat(SRC);
} catch {
  await mkdir(SRC, { recursive: true });
  adopted = true;
}
await mkdir(OUT, { recursive: true });
if (adopted) {
  for (const f of await readdir(OUT)) {
    if (RASTER.has(ext(f))) await rename(join(OUT, f), join(SRC, f));
  }
  console.log('Originales movidos de images/ a images-src/.');
}

const files = (await readdir(SRC)).filter((f) => RASTER.has(ext(f))).sort();
const seen = new Set();
let before = 0;
let after = 0;
let done = 0;
let skipped = 0;

for (const f of files) {
  const id = parse(f).name.toLowerCase();
  if (seen.has(id)) {
    console.warn(`  Aviso: hay varios originales para "${id}"; se usa el primero.`);
    continue;
  }
  seen.add(id);
  const src = join(SRC, f);
  const out = join(OUT, `${id}.webp`);
  if ((await mtime(out)) > (await mtime(src))) {
    skipped++;
    after += (await stat(out)).size;
    before += (await stat(src)).size;
    continue;
  }
  try {
    await sharp(src, { failOn: 'none' })
      .rotate() // respeta la orientación EXIF
      .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(out);
    const s0 = (await stat(src)).size;
    const s1 = (await stat(out)).size;
    before += s0;
    after += s1;
    done++;
    console.log(`  ${f}: ${mb(s0)} -> ${Math.round(s1 / 1024)} KB`);
  } catch (e) {
    console.warn(`  ERROR con ${f}: ${e.message}`);
  }
}

console.log(`\n${done} convertidas, ${skipped} ya estaban al día.`);
console.log(`Total: ${mb(before)} -> ${mb(after)}`);
console.log('Ahora ejecuta: node sync.mjs');

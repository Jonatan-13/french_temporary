// Sincroniza el contenido de words.json:
//   1. Genera con Google Cloud TTS el audio que todavía no exista (idempotente).
//   2. Detecta las imágenes de images/ (images/<id>.png|jpg|webp...).
//   3. Escribe data.js, que es lo que lee la página.
//
// Uso:
//   node sync.mjs            -> genera lo que falte y actualiza data.js
//   node sync.mjs --dry      -> solo muestra qué se generaría (no llama a la API)
//   node sync.mjs --prune    -> además borra audios que ya no usa ningún texto
//
// La clave de API se pide por consola (sin mostrarla) solo cuando hay audios por
// generar. Si existe la variable GOOGLE_TTS_API_KEY se usa esa, sin preguntar.
// Nunca se escribe en ningún archivo.

import { readFile, writeFile, mkdir, readdir, access, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TTS_BASE_URL ?? 'https://texttospeech.googleapis.com/v1';
let KEY = process.env.GOOGLE_TTS_API_KEY; // opcional: si no existe, se pide por consola
const DRY = process.argv.includes('--dry');
const PRUNE = process.argv.includes('--prune');
const IMAGE_EXT = ['webp', 'avif', 'png', 'jpg', 'jpeg', 'gif', 'svg'];

function askKey() {
  if (!process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let hidden = false;
    rl._writeToOutput = (str) => rl.output.write(hidden ? (/[\r\n]/.test(str) ? '\n' : '') : str);
    rl.question('Clave de API de Google TTS (no se muestra al escribir): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    hidden = true;
  });
}

const exists = (p) => access(p).then(() => true, () => false);

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// --- 1. Leer y validar words.json -----------------------------------------
const config = JSON.parse(await readFile(join(here, 'words.json'), 'utf8'));
const voice = config.settings?.voice ?? 'fr-FR-Neural2-F';
const rate = config.settings?.speakingRate ?? 0.75;

const seenIds = new Set();
const words = (config.words ?? []).map((w, i) => {
  if (!w.id || !/^[a-z0-9_-]+$/.test(w.id)) fail(`words[${i}]: "id" obligatorio, solo a-z, 0-9, - y _ (recibido: ${JSON.stringify(w.id)})`);
  if (seenIds.has(w.id)) fail(`id repetido: ${w.id}`);
  seenIds.add(w.id);
  if (!w.word?.trim()) fail(`"${w.id}": falta "word"`);
  const phrases = (w.phrases ?? []).map((p, j) => {
    const o = typeof p === 'string' ? { text: p } : p;
    if (!o.text?.trim()) fail(`"${w.id}" frase ${j + 1}: falta "text"`);
    return { text: o.text.trim(), translation: o.translation?.trim() || undefined };
  });
  return { ...w, word: w.word.trim(), phrases };
});

// --- 2. Audio: un archivo por texto, nombrado por hash (voz + velocidad + texto)
const audioName = (text) =>
  createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 12) + '.mp3';

const texts = new Set();
for (const w of words) {
  texts.add(w.word);
  for (const p of w.phrases) texts.add(p.text);
}

await mkdir(join(here, 'audio'), { recursive: true });
const pending = [];
for (const t of texts) {
  if (!(await exists(join(here, 'audio', audioName(t))))) pending.push(t);
}
console.log(`${texts.size} textos, ${texts.size - pending.length} con audio, ${pending.length} por generar.`);

let errors = 0;
if (pending.length && DRY) {
  for (const t of pending) console.log(`  (pendiente) ${t}`);
  console.log(`Caracteres que se enviarían: ${pending.reduce((n, t) => n + t.length, 0)}`);
} else if (pending.length) {
  KEY ||= await askKey();
  if (!KEY) console.warn('Sin clave: no se generan los audios pendientes (enter vacío o sin consola interactiva).');
  let chars = 0;
  for (const t of KEY ? pending : []) {
    try {
      const res = await fetch(`${BASE}/text:synthesize`, {
        method: 'POST',
        headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          input: { text: t },
          voice: { languageCode: 'fr-FR', name: voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
        }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.parse(body).error?.message ?? body}`);
      await writeFile(join(here, 'audio', audioName(t)), Buffer.from(JSON.parse(body).audioContent, 'base64'));
      chars += t.length;
      console.log(`  generado: ${t}`);
    } catch (e) {
      errors++;
      console.warn(`  ERROR con "${t}": ${e.message}`);
    }
  }
  if (KEY) console.log(`Caracteres enviados en esta ejecución: ${chars}`);
}

// --- 3. Imágenes: images/<id>.<ext>
const imageFiles = (await exists(join(here, 'images'))) ? await readdir(join(here, 'images')) : [];
const imageFor = (id) => {
  const hits = imageFiles.filter((f) => {
    const dot = f.lastIndexOf('.');
    return f.slice(0, dot).toLowerCase() === id && IMAGE_EXT.includes(f.slice(dot + 1).toLowerCase());
  });
  if (hits.length > 1) console.warn(`  Aviso: hay varias imágenes para "${id}" (${hits.join(', ')}); se usa ${hits[0]}.`);
  return hits[0] ? `images/${hits[0]}` : undefined;
};
const knownIds = new Set(words.map((w) => w.id));
for (const f of imageFiles) {
  const base = f.slice(0, f.lastIndexOf('.')).toLowerCase();
  if (!knownIds.has(base)) console.warn(`  Aviso: images/${f} no coincide con ningún id de words.json.`);
}

// --- 4. data.js
const audioIfExists = async (t) => ((await exists(join(here, 'audio', audioName(t)))) ? `audio/${audioName(t)}` : undefined);
const out = [];
for (const w of words) {
  out.push({
    id: w.id,
    word: w.word,
    translation: w.translation,
    gender: w.gender,
    mark: w.mark,
    image: imageFor(w.id),
    audio: await audioIfExists(w.word),
    phrases: await Promise.all(w.phrases.map(async (p) => ({ ...p, audio: await audioIfExists(p.text) }))),
  });
}
await writeFile(join(here, 'data.js'), `// Generado por sync.mjs. No lo edites a mano.\nwindow.PRACTICE = ${JSON.stringify(out, null, 2)};\n`);
console.log(`data.js actualizado (${out.length} palabras, ${out.filter((w) => w.image).length} con imagen).`);

// --- 5. Audios huérfanos
const used = new Set([...texts].map(audioName));
const orphans = (await readdir(join(here, 'audio'))).filter((f) => f.endsWith('.mp3') && !used.has(f));
if (orphans.length) {
  if (PRUNE) {
    for (const f of orphans) await unlink(join(here, 'audio', f)).catch((e) => console.warn(`  No se pudo borrar ${f}: ${e.message}`));
    console.log(`${orphans.length} audios sin uso borrados.`);
  } else {
    console.log(`Hay ${orphans.length} audios sin uso (texto cambiado o borrado). Para borrarlos: node sync.mjs --prune`);
  }
}
if (errors) process.exit(1);

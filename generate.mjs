// Prueba de voces: Google Cloud Text-to-Speech, francés de Francia (fr-FR).
//
// Uso:
//   node generate.mjs                       -> elige 4 voces automáticamente
//   node generate.mjs --voices=NOMBRE,NOMBRE -> usa las voces que indiques
//
// La clave de API se lee de la variable de entorno GOOGLE_TTS_API_KEY.
// Nunca se escribe en ningún archivo ni se imprime.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
const audioDir = join(outDir, 'audio');

const BASE = process.env.TTS_BASE_URL ?? 'https://texttospeech.googleapis.com/v1';
const KEY = process.env.GOOGLE_TTS_API_KEY;
const SPEEDS = { normal: 1.0, slow: 0.75 }; // velocidad de lectura

if (!KEY) {
  console.error('Falta la variable de entorno GOOGLE_TTS_API_KEY (mira el README).');
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = body;
    try {
      msg = JSON.parse(body).error?.message ?? body;
    } catch {}
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return JSON.parse(body);
}

const familyOf = (name) =>
  name.includes('Chirp3') ? 'Chirp 3 HD' : name.includes('Neural2') ? 'Neural2' : 'Otra';

function pickVoices(all, requested) {
  if (requested.length) {
    return requested.map((name) => {
      const found = all.find((v) => v.name === name);
      if (!found) console.warn(`Aviso: "${name}" no aparece en la lista fr-FR; se intentará igualmente.`);
      return { name, family: familyOf(name), gender: found?.ssmlGender ?? '?' };
    });
  }
  const picked = [];
  for (const tag of ['Chirp3-HD', 'Neural2']) {
    for (const gender of ['FEMALE', 'MALE']) {
      const v = all
        .filter((x) => x.name.includes(tag) && x.ssmlGender === gender)
        .sort((a, b) => a.name.localeCompare(b.name))[0];
      if (v) picked.push({ name: v.name, family: familyOf(v.name), gender });
      else console.warn(`Aviso: no hay voz ${tag} ${gender} en fr-FR.`);
    }
  }
  return picked;
}

async function synth(text, voiceName, rate) {
  const data = await api('/text:synthesize', {
    method: 'POST',
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'fr-FR', name: voiceName },
      audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
    }),
  });
  return Buffer.from(data.audioContent, 'base64');
}

const exists = (p) => access(p).then(() => true, () => false);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function buildHtml(samples, voices, ok) {
  const head = voices
    .map(
      (v) =>
        `<th>${esc(v.family)}<br><small>${esc(v.gender === 'FEMALE' ? 'femenina' : v.gender === 'MALE' ? 'masculina' : '?')}<br>${esc(v.name)}</small></th>`,
    )
    .join('');
  const rows = samples
    .map((s) => {
      const cells = voices
        .map((v) => {
          const players = Object.keys(SPEEDS)
            .map((speed) => {
              const rel = `audio/${v.name}/${s.id}.${speed}.mp3`;
              const label = speed === 'normal' ? 'normal' : 'lenta';
              return ok.has(rel)
                ? `<div><span>${label}</span><audio controls preload="none" src="${esc(rel)}"></audio></div>`
                : `<div><span>${label}</span><em>error al generar</em></div>`;
            })
            .join('');
          return `<td>${players}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(s.text)}<br><small>${esc(s.kind)}</small></th>${cells}</tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prueba de voces fr-FR</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1.5rem; color: #1b1b1b; background: #fafafa; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: .5rem .7rem; vertical-align: top; background: #fff; }
  thead th { position: sticky; top: 0; background: #eee; }
  th small { font-weight: normal; color: #555; }
  td div { display: flex; align-items: center; gap: .4rem; margin: .15rem 0; }
  td span { width: 3.2rem; font-size: .8rem; color: #555; }
  audio { height: 32px; width: 220px; }
  em { color: #b00020; font-size: .85rem; }
</style>
</head>
<body>
<h1>Prueba de voces (fr-FR)</h1>
<p>Escucha cada fila con todas las voces. Fíjate sobre todo en las palabras sueltas, en los números y en los enlaces (<em style="color:inherit">les amis</em>).</p>
<table>
<thead><tr><th>Texto</th>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`;
}

async function main() {
  const samples = JSON.parse(await readFile(join(here, 'samples.json'), 'utf8'));
  const arg = process.argv.find((a) => a.startsWith('--voices='));
  const requested = arg ? arg.slice('--voices='.length).split(',').map((s) => s.trim()).filter(Boolean) : [];

  console.log('Consultando las voces fr-FR disponibles...');
  const { voices: all = [] } = await api('/voices?languageCode=fr-FR');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'voces-fr-FR.txt'),
    all.map((v) => `${v.name}\t${v.ssmlGender}`).sort().join('\n') + '\n',
  );
  console.log(`  ${all.length} voces. Lista completa en out/voces-fr-FR.txt`);

  const voices = pickVoices(all, requested);
  if (!voices.length) {
    console.error('No se encontró ninguna voz para probar.');
    process.exit(1);
  }
  console.log('Voces elegidas:');
  for (const v of voices) console.log(`  - ${v.name} (${v.family}, ${v.gender})`);

  const ok = new Set();
  let billedChars = 0;
  let errors = 0;

  for (const v of voices) {
    await mkdir(join(audioDir, v.name), { recursive: true });
    for (const s of samples) {
      for (const [speed, rate] of Object.entries(SPEEDS)) {
        const rel = `audio/${v.name}/${s.id}.${speed}.mp3`;
        const file = join(outDir, ...rel.split('/'));
        if (await exists(file)) {
          ok.add(rel); // ya generado antes: no se vuelve a pedir
          continue;
        }
        try {
          await writeFile(file, await synth(s.text, v.name, rate));
          billedChars += s.text.length;
          ok.add(rel);
        } catch (e) {
          errors++;
          console.warn(`  Error en ${rel}: ${e.message}`);
        }
      }
    }
    console.log(`  Listo: ${v.name}`);
  }

  await writeFile(join(outDir, 'index.html'), buildHtml(samples, voices, ok));
  console.log(`\nCaracteres enviados en esta ejecución: ${billedChars}`);
  if (errors) console.log(`Hubo ${errors} errores; revisa los mensajes de arriba.`);
  console.log('Abre out/index.html en tu navegador para comparar.');
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});

# Práctica de vocabulario (versión temporal)

Página estática con una cuadrícula de palabras. Imagen arriba, palabra abajo.

- Clic en la **palabra**: suena. Al pasar el mouse aparece el ícono de reproducir.
- Las traducciones están ocultas; el ojo de cada tarjeta muestra u oculta la suya, y el ojo del dialog controla las de todas las frases.
- Botón arriba a la derecha: modo claro/oscuro (se recuerda).
- Clic en la **imagen**: se abre una ventana con la imagen y las frases; cada frase
  suena al hacer clic (el ícono aparece al pasar el mouse).

## Abrirla

Doble clic en `index.html`. No necesita servidor.

## Añadir o cambiar contenido

Todo está en `words.json`:

```json
{ "id": "pomme", "word": "la pomme", "translation": "la manzana", "gender": "f",
  "phrases": [ "Je mange une pomme.", { "text": "Elle coupe la pomme.", "translation": "Ella corta la manzana." } ] }
```

- `id`: obligatorio, único, solo `a-z 0-9 - _`. Une la palabra con su imagen.
- `word`: lo que se muestra y se pronuncia (con artículo si quieres).
- `translation`, `gender` (`m`/`f`, subraya el artículo en azul/rosa): opcionales.
- `phrases`: texto simple, o `{ "text", "translation" }`. Se pronuncia solo `text`.

Luego, en PowerShell (en esta carpeta):

```powershell
node sync.mjs
```

Si hay audios por generar, el script **pide la clave de API por consola** (no se
muestra al escribirla y no se guarda en ningún archivo), y la vuelve a pedir en cada
ejecución que lo necesite. Si no hay nada que generar, no pide nada. Con enter
vacío se omite la generación y solo se actualiza `data.js`. (Si prefieres no
teclearla, puedes definir `GOOGLE_TTS_API_KEY` y se usa sin preguntar.)

Recarga `index.html`.

Campo opcional `mark`: texto grande del degradado cuando no hay imagen (por ejemplo
`"mark": "7"`); por defecto es la inicial de la palabra.

## Imagen (opcional)

Copia un archivo a `images/` con el **mismo nombre que el id**: `images/pomme.webp`
(vale webp, avif, png, jpg, jpeg, gif, svg). Sin imagen se muestra un degradado
de color propio de cada palabra. Después de añadirla, ejecuta `node sync.mjs`
(con enter vacío en la clave) para que `data.js` la detecte.

## Cómo evita duplicar audios

Cada audio se guarda como `audio/<hash>.mp3`, donde el hash sale de voz + velocidad
+ texto. Si el texto no cambió, el archivo ya existe y no se vuelve a pedir:
ejecutarlo dos veces seguidas no genera nada. Si cambias un texto, se genera solo
el nuevo. Los audios que ya no usa ningún texto se listan, y se borran con
`node sync.mjs --prune`.

Otras opciones: `node sync.mjs --dry` muestra qué faltaría y cuántos caracteres
se enviarían, sin llamar a la API.

## Voz

En `words.json > settings`: `voice` (por defecto `fr-FR-Neural2-F`) y
`speakingRate` (0.75 = lenta). Cambiar cualquiera de los dos regenera todos los audios.

## Archivos

`index.html`, `practice.css` y `practice.js` (página), `words.json` (tu contenido), `sync.mjs` (script),
`data.js` (generado, no editar), `audio/` (generado), `images/` (tuyas).
`generate.mjs`, `samples.json` y `out/` son de la prueba de voces anterior y no se tocan.

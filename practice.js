const words = window.PRACTICE ?? [];
const grid = document.getElementById('grid');
const dialog = document.getElementById('dialog');
const dlgMedia = document.getElementById('dlg-media');
const dlgHead = document.getElementById('dlg-head');
const dlgEyeSlot = document.getElementById('dlg-eye-slot');
const dlgTranslation = document.getElementById('dlg-translation');
const dlgPhrases = document.getElementById('dlg-phrases');

const ICON_EYE = '<svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5C18.4 5.5 22 12 22 12a17 17 0 0 1-3.2 4M6.4 6.9A16.6 16.6 0 0 0 2 12s3.6 6.5 10 6.5c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';

// --- Audio: uno solo a la vez ---------------------------------------------
let player = null;
let playingBtn = null;

function play(src, btn) {
  if (!src) return;
  if (player) {
    player.pause();
    playingBtn?.classList.remove('playing');
  }
  player = new Audio(src);
  playingBtn = btn;
  btn?.classList.add('playing');
  const done = () => btn?.classList.remove('playing');
  player.addEventListener('ended', done);
  player.addEventListener('error', done);
  player.play().catch(done);
}

// --- Utilidades -------------------------------------------------------------
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function hue(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// Imagen real si existe; si no, un degradado propio de cada palabra.
function media(w) {
  if (w.image) {
    const img = el('img', { src: w.image, alt: w.word, loading: 'lazy', draggable: false });
    return img;
  }
  const h = hue(w.id);
  const box = el('div', { className: 'placeholder', ariaHidden: 'true' }, el('span', {}, (w.mark ?? w.word.replace(/^(le|la|les|l')\s*/i, '')[0] ?? '?')));
  box.style.background = `linear-gradient(135deg, hsl(${h} 75% 62%), hsl(${(h + 55) % 360} 70% 48%))`;
  return box;
}

function wordButton(w, big = false) {
  const btn = el('button', { type: 'button', className: 'word' + (big ? ' big' : '') + (w.audio ? '' : ' no-audio'), title: w.audio ? 'Écouter' : 'Audio non généré' });
  btn.dataset.gender = w.gender ?? '';
  btn.append(el('span', { className: 'text' }, w.word));
  btn.insertAdjacentHTML('beforeend', `<span class="icon">${ICON_PLAY}</span>`);
  btn.addEventListener('click', () => play(w.audio, btn));
  return btn;
}

// Botón ojo: aria-pressed = traducción visible. onChange recibe el nuevo estado.
function eyeButton(onChange) {
  const btn = el('button', { type: 'button', className: 'eye' });
  btn.insertAdjacentHTML('beforeend', ICON_EYE);
  const set = (visible) => {
    btn.setAttribute('aria-pressed', String(visible));
    btn.setAttribute('aria-label', visible ? 'Ocultar traducción' : 'Mostrar traducción');
    btn.title = btn.getAttribute('aria-label');
    onChange(visible);
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-pressed') !== 'true'));
  set(false);
  return btn;
}

// --- Grid -------------------------------------------------------------------
for (const w of words) {
  const open = el('button', { type: 'button', className: 'media', ariaLabel: `Phrases : ${w.word}` }, media(w));
  const n = w.phrases.length;
  open.append(el('span', { className: 'badge' }, `${n} phrase${n === 1 ? '' : 's'}`));
  open.addEventListener('click', () => openDialog(w));

  const card = el('li', { className: 'card' }, open, wordButton(w));
  if (w.translation) {
    const text = el('span', { className: 'tr' }, w.translation);
    const row = el('p', { className: 'translation tr-row' }, text);
    row.append(eyeButton((visible) => {
      row.classList.toggle('revealed', visible);
      text.setAttribute('aria-hidden', String(!visible));
    }));
    card.append(row);
  }
  grid.append(card);
}
if (!words.length) grid.replaceWith(el('p', { className: 'empty' }, 'Aucun mot. Ajoute des mots dans words.json puis lance node sync.mjs.'));

// --- Dialog -----------------------------------------------------------------
function openDialog(w) {
  dlgMedia.replaceChildren(media(w));
  dlgHead.replaceChildren(wordButton(w, true));
  dlgTranslation.textContent = w.translation ?? '';
  const hasTranslations = w.translation || w.phrases.some((p) => p.translation);
  dlgEyeSlot.replaceChildren(
    ...(hasTranslations
      ? [eyeButton((visible) => {
          dialog.classList.toggle('show-tr', visible);
          for (const t of dialog.querySelectorAll('#dlg-translation, .phrase small')) t.setAttribute('aria-hidden', String(!visible));
        })]
      : []),
  );
  if (!hasTranslations) dialog.classList.remove('show-tr');
  dlgPhrases.replaceChildren(
    ...w.phrases.map((p) => {
      const btn = el('button', { type: 'button', className: 'phrase' + (p.audio ? '' : ' no-audio'), title: p.audio ? 'Écouter' : 'Audio non généré' });
      btn.append(el('span', { className: 'text' }, p.text));
      btn.insertAdjacentHTML('beforeend', `<span class="icon">${ICON_PLAY}</span>`);
      if (p.translation) btn.append(el('small', {}, p.translation));
      btn.addEventListener('click', () => play(p.audio, btn));
      return el('li', {}, btn);
    }),
  );
  if (!w.phrases.length) dlgPhrases.append(el('li', { className: 'empty' }, 'Pas encore de phrases.'));
  dialog.showModal();
  dialog.scrollTop = 0;
}

dialog.addEventListener('close', () => {
  player?.pause();
  playingBtn?.classList.remove('playing');
});
document.getElementById('dlg-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close(); // clic en el fondo
});

// --- Tema claro / oscuro ----------------------------------------------------
document.getElementById('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const current = root.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
});

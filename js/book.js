/* Songbook viewer: one song at a time, built for phones and tablets. */
(function () {
  'use strict';

  const S = window.SongLib;
  const C = window.SBCommon;
  const cfg = window.SONGBOOK_CONFIG || {};
  const $ = sel => document.querySelector(sel);

  const params = new URLSearchParams(location.search);
  const entries = (params.get('songs') || '').split(',').map(S.parseEntry).filter(e => S.SLUG_RE.test(e.slug));
  const slugs = entries.map(e => e.slug);
  const bookTitle = (params.get('title') || cfg.defaultSetTitle || 'Songbook').slice(0, 120);

  const FONT_MIN = 0.9, FONT_MAX = 2.6, FONT_STEP = 0.1;

  const state = {
    songs: [],
    idx: 0,
    chords: C.store.get('songbook.chords', true),
    font: C.store.get('songbook.font', 1.25),
    steps: Object.fromEntries(entries.filter(e => e.steps).map(e => [e.slug, e.steps])),
    awake: C.store.get('songbook.awake', true)
  };

  const el = {
    main: $('#song'), pos: $('#pos'), prev: $('#prevBtn'), next: $('#nextBtn'),
    chordBtn: $('#chordBtn'), drawer: $('#drawer'), toc: $('#toc')
  };

  /* ---------- rendering ---------- */

  function metaLine(song, steps) {
    const key = song.key ? S.transposeKey(song.key, steps) : '';
    return [key && `Key ${key}`, song.tempo && `${song.tempo} bpm`, song.author].filter(Boolean).map(S.esc).join(' · ');
  }

  function songHTML(song, i, forPrint) {
    if (song.error) {
      return `<header class="song-head"><span class="song-num">${i + 1}</span><div><h2>${S.esc(song.slug)}</h2>
        <p class="song-meta">${S.esc(song.error)}</p></div></header>`;
    }
    const steps = state.steps[song.slug] || 0;
    const showTranspose = !forPrint && state.chords && song.hasChords;
    const transpose = showTranspose ? `<div class="transpose" role="group" aria-label="Transpose">
        <span>Key <b>${S.esc(S.transposeKey(song.key, steps) || '—')}</b>${steps ? ` <small>(${steps > 0 ? '+' : ''}${steps})</small>` : ''}</span>
        <button type="button" data-steps="-1" aria-label="Transpose down a semitone">−</button>
        <button type="button" data-steps="1" aria-label="Transpose up a semitone">+</button>
        ${steps ? '<button type="button" data-steps="0" class="reset" aria-label="Back to original key">↺</button>' : ''}
      </div>` : '';
    return `<header class="song-head">
        <span class="song-num">${i + 1}</span>
        <div><h2>${S.esc(song.title)}</h2><p class="song-meta">${metaLine(song, steps)}</p></div>
      </header>
      ${transpose}
      <div class="lyrics">${S.renderLyrics(song, { chords: state.chords, steps })}</div>
      ${song.copyright ? `<p class="song-foot">${S.esc(song.copyright)}</p>` : ''}`;
  }

  function show(i, opts) {
    if (!state.songs.length) return;
    state.idx = Math.max(0, Math.min(state.songs.length - 1, i));
    const song = state.songs[state.idx];
    el.main.innerHTML = songHTML(song, state.idx);
    el.pos.textContent = `Song ${state.idx + 1} of ${state.songs.length}`;
    history.replaceState(null, '', `#${state.idx + 1}`);

    const prev = state.songs[state.idx - 1], next = state.songs[state.idx + 1];
    el.prev.disabled = !prev;
    el.next.disabled = !next;
    el.prev.querySelector('.lbl').textContent = prev ? prev.title : '';
    el.next.querySelector('.lbl').textContent = next ? next.title : 'End of songbook';

    [...el.toc.children].forEach((li, j) => {
      const a = li.querySelector('button');
      if (a) a.setAttribute('aria-current', j === state.idx ? 'true' : 'false');
    });
    if (!opts || !opts.keepScroll) window.scrollTo(0, 0);
  }

  function rerender() {
    show(state.idx, { keepScroll: true });
  }

  function renderToc() {
    el.toc.innerHTML = state.songs.map((s, i) =>
      `<li><button type="button" data-go="${i}"><span class="toc-n">${i + 1}</span><span class="toc-t">${S.esc(s.title)}${s.key ? `<small>${S.esc(s.key)}</small>` : ''}</span></button></li>`
    ).join('');
  }

  function renderEmpty(msg) {
    el.main.innerHTML = `<div class="empty-book"><h2>${S.esc(msg)}</h2>
      <p>This link doesn’t contain any songs. Go to the song picker to build a songbook.</p>
      <p><a class="btn primary" href="index.html">Open the song picker</a></p></div>`;
    el.pos.textContent = '';
  }

  /* ---------- settings ---------- */

  function applyFont() {
    document.documentElement.style.setProperty('--lyric-size', state.font + 'rem');
    C.store.set('songbook.font', state.font);
  }

  function setChords(on) {
    state.chords = on;
    C.store.set('songbook.chords', on);
    el.chordBtn.setAttribute('aria-pressed', String(on));
    el.chordBtn.setAttribute('aria-label', on ? 'Hide chords' : 'Show chords');
    rerender();
  }

  /* ---------- screen wake lock ---------- */

  let lock = null;
  async function requestWake() {
    if (!state.awake || !('wakeLock' in navigator) || lock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch (e) { lock = null; }
  }
  function releaseWake() {
    if (lock) { lock.release().catch(() => {}); lock = null; }
  }

  /* ---------- print ---------- */

  function buildPrint() {
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    $('#printAll').innerHTML = `<section class="print-cover">
        <h1>${S.esc(bookTitle)}</h1><p>${S.esc(date)}</p>
        <ol>${state.songs.map(s => `<li>${S.esc(s.title)}${s.key ? ` <small>(${S.esc(S.transposeKey(s.key, state.steps[s.slug] || 0))})</small>` : ''}</li>`).join('')}</ol>
      </section>` +
      state.songs.map((s, i) => `<article class="print-song">${songHTML(s, i, true)}</article>`).join('');
  }

  /* ---------- events ---------- */

  function closeDrawer() { if (el.drawer.open) el.drawer.close(); }

  function bind() {
    el.prev.addEventListener('click', () => show(state.idx - 1));
    el.next.addEventListener('click', () => show(state.idx + 1));

    $('#fontUp').addEventListener('click', () => { state.font = Math.min(FONT_MAX, +(state.font + FONT_STEP).toFixed(2)); applyFont(); });
    $('#fontDown').addEventListener('click', () => { state.font = Math.max(FONT_MIN, +(state.font - FONT_STEP).toFixed(2)); applyFont(); });
    el.chordBtn.addEventListener('click', () => setChords(!state.chords));

    el.main.addEventListener('click', e => {
      const b = e.target.closest('[data-steps]');
      if (!b) return;
      const song = state.songs[state.idx];
      const d = +b.dataset.steps;
      state.steps[song.slug] = d === 0 ? 0 : S.normSteps((state.steps[song.slug] || 0) + d);
      rerender();
    });

    $('#tocBtn').addEventListener('click', () => {
      if (typeof el.drawer.showModal === 'function') el.drawer.showModal(); else el.drawer.setAttribute('open', '');
      const cur = el.toc.querySelector('[aria-current="true"]');
      if (cur) cur.focus();
    });
    el.drawer.addEventListener('click', e => {
      if (e.target === el.drawer || e.target.closest('[data-close]')) return closeDrawer();
      const go = e.target.closest('[data-go]');
      if (go) { closeDrawer(); show(+go.dataset.go); }
    });

    $('#themeBtn').addEventListener('click', C.toggleTheme);

    $('#shareBtn').addEventListener('click', async () => {
      const url = location.href.split('#')[0];
      if (navigator.share) {
        navigator.share({ title: bookTitle, url }).catch(() => {});
      } else {
        C.toast(await C.copyText(url) ? 'Link copied' : 'Could not copy the link');
      }
    });

    $('#printBtn').addEventListener('click', () => {
      closeDrawer();
      buildPrint();
      setTimeout(() => window.print(), 50);
    });

    if ('wakeLock' in navigator) {
      $('#awakeRow').hidden = false;
      const box = $('#awake');
      box.checked = state.awake;
      box.addEventListener('change', () => {
        state.awake = box.checked;
        C.store.set('songbook.awake', state.awake);
        if (state.awake) requestWake(); else releaseWake();
      });
      document.addEventListener('visibilitychange', requestWake);
      document.addEventListener('click', requestWake, { once: true });
    }

    document.addEventListener('keydown', e => {
      if (el.drawer.open || e.altKey || e.ctrlKey || e.metaKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); show(state.idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(state.idx - 1); }
    });

    // Swipe left / right to change song
    let sx = 0, sy = 0, st = 0, tracking = false;
    el.main.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    el.main.addEventListener('touchend', e => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st < 700 && Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6) {
        show(state.idx + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    window.addEventListener('beforeprint', buildPrint);
  }

  /* ---------- start ---------- */

  async function init() {
    document.title = bookTitle;
    $('#bookTitle').textContent = bookTitle;
    $('#editLink').href = `index.html?title=${encodeURIComponent(bookTitle)}&songs=${entries.map(e => S.formatEntry(e.slug, e.steps)).join(',')}`;
    applyFont();
    bind();

    if (!slugs.length) return renderEmpty('No songs selected');

    state.songs = await Promise.all(slugs.map(slug =>
      S.loadSong(slug).catch(e => ({ slug, title: slug, error: e.message, sections: [], tags: [] }))
    ));

    if (state.songs.some(s => s.hasChords)) {
      el.chordBtn.hidden = false;
      el.chordBtn.setAttribute('aria-pressed', String(state.chords));
    }
    renderToc();
    const start = parseInt(location.hash.slice(1), 10);
    show(Number.isFinite(start) ? start - 1 : 0);
    requestWake();
    C.registerOffline();
  }

  init();
})();

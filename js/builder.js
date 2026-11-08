/* Song picker: browse the library, build an ordered set, create a share link. */
(function () {
  'use strict';

  const S = window.SongLib;
  const C = window.SBCommon;
  const cfg = window.SONGBOOK_CONFIG || {};
  const $ = sel => document.querySelector(sel);
  const STORE_KEY = 'songbook.builder.v1';

  const state = {
    songs: [],
    bySlug: new Map(),
    set: [],
    steps: {},
    title: '',
    tag: '',
    q: '',
    previewSlug: null
  };

  const el = {
    list: $('#songList'), status: $('#libStatus'), count: $('#libCount'), search: $('#search'),
    tags: $('#tags'), source: $('#sourceNote'), panel: $('#setPanel'), scrim: $('#scrim'),
    setList: $('#setList'), setEmpty: $('#setEmpty'), setCount: $('#setCount'), fabCount: $('#fabCount'),
    title: $('#setTitle'), make: $('#makeLink'), result: $('#result'), linkOut: $('#linkOut'),
    openLink: $('#openLink'), share: $('#shareLink'), qr: $('#qr'),
    preview: $('#preview'), pvTitle: $('#pvTitle'), pvMeta: $('#pvMeta'), pvBody: $('#pvBody'), pvAdd: $('#pvAdd')
  };

  function defaultTitle() {
    const d = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return `${cfg.defaultSetTitle || 'Praise & Worship'} · ${d}`;
  }

  /* ---------- persistence ---------- */

  function restore() {
    const p = new URLSearchParams(location.search);
    if (p.has('songs')) {
      p.get('songs').split(',').map(S.parseEntry).filter(e => S.SLUG_RE.test(e.slug)).forEach(e => {
        state.set.push(e.slug);
        if (e.steps) state.steps[e.slug] = e.steps;
      });
      state.title = p.get('title') || defaultTitle();
      history.replaceState(null, '', location.pathname);
    } else {
      const saved = C.store.get(STORE_KEY, null);
      if (saved && Array.isArray(saved.set)) {
        state.set = saved.set.filter(s => S.SLUG_RE.test(s));
        state.steps = saved.steps && typeof saved.steps === 'object' ? saved.steps : {};
        state.title = saved.title || defaultTitle();
      } else {
        state.title = defaultTitle();
      }
    }
    state.set = [...new Set(state.set)];
    el.title.value = state.title;
  }

  function save() {
    const steps = {};
    state.set.forEach(slug => { if (state.steps[slug]) steps[slug] = state.steps[slug]; });
    C.store.set(STORE_KEY, { set: state.set, title: state.title, steps });
  }

  /* ---------- library ---------- */

  function songMeta(s) {
    const bits = [];
    if (s.key) bits.push(`<span>Key ${S.esc(s.key)}</span>`);
    if (s.hasChords) bits.push('<span>Chords</span>');
    if (s.author) bits.push(`<span>${S.esc(s.author)}</span>`);
    s.tags.forEach(t => bits.push(`<span class="tag">${S.esc(t)}</span>`));
    return bits.join('');
  }

  function matches(s, q) {
    if (state.tag && !s.tags.includes(state.tag)) return false;
    if (!q) return true;
    const hay = [s.title, s.author, s.number, s.tags.join(' '), s.words || s.firstLine].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }

  function renderLibrary() {
    const q = state.q.trim().toLowerCase();
    const items = state.songs.filter(s => matches(s, q));
    el.count.textContent = state.songs.length;
    el.list.innerHTML = items.map(s => {
      const inSet = state.set.includes(s.slug);
      return `<li class="song-row${inSet ? ' in-set' : ''}">
        <button class="row-main" type="button" data-preview="${s.slug}" aria-label="Preview ${S.esc(s.title)}">
          <span class="row-title">${s.number ? `<span class="row-num">${S.esc(s.number)}</span>` : ''}${S.esc(s.title)}</span>
          <span class="row-first">${S.esc(s.firstLine)}</span>
          <span class="row-meta">${songMeta(s)}</span>
        </button>
        <button class="add-btn" type="button" data-toggle="${s.slug}" aria-pressed="${inSet}">
          ${inSet ? '✓ Added' : '+ Add'}
        </button>
      </li>`;
    }).join('');
    if (!state.songs.length || el.status.classList.contains('warn')) return;
    el.status.hidden = items.length > 0;
    el.status.textContent = items.length ? '' : 'No songs match your search.';
  }

  function renderTags() {
    const counts = new Map();
    state.songs.forEach(s => s.tags.forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
    const tags = [...counts.keys()].sort();
    el.tags.innerHTML = ['', ...tags].map(t =>
      `<button type="button" class="chip" data-tag="${S.esc(t)}" aria-pressed="${state.tag === t}">${t ? S.esc(t) : 'All'}</button>`
    ).join('');
  }

  /* ---------- set ---------- */

  function renderSet() {
    el.setCount.textContent = state.set.length;
    el.fabCount.textContent = state.set.length;
    el.setEmpty.hidden = state.set.length > 0;
    el.make.disabled = state.set.length === 0;
    el.setList.innerHTML = state.set.map((slug, i) => {
      const s = state.bySlug.get(slug);
      const title = s ? s.title : slug;
      const missing = state.songs.length && !s;
      return `<li class="set-item${missing ? ' missing' : ''}">
        <span class="set-num">${i + 1}</span>
        <span class="set-title">${S.esc(title)}${missing ? '<small>not found in library</small>' : keyControl(s)}</span>
        <span class="set-btns">
          <button type="button" class="mini" data-move="-1" data-i="${i}" aria-label="Move ${S.esc(title)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="mini" data-move="1" data-i="${i}" aria-label="Move ${S.esc(title)} down" ${i === state.set.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="mini danger" data-remove="${i}" aria-label="Remove ${S.esc(title)}">✕</button>
        </span>
      </li>`;
    }).join('');
  }

  function keyControl(s) {
    if (!s) return '';
    const st = state.steps[s.slug] || 0;
    const shown = s.key ? S.transposeKey(s.key, st) : '';
    if (!s.hasChords) return s.key ? `<small>Key ${S.esc(s.key)}</small>` : '';
    return `<span class="key-ctl" role="group" aria-label="Key for ${S.esc(s.title)}">
        <button type="button" data-tr="-1" data-slug="${s.slug}" aria-label="Transpose ${S.esc(s.title)} down">−</button>
        <span class="key-val">${shown ? 'Key ' + S.esc(shown) : (st ? (st > 0 ? '+' : '') + st : 'Original')}${st && shown ? ` <em>${st > 0 ? '+' : ''}${st}</em>` : ''}</span>
        <button type="button" data-tr="1" data-slug="${s.slug}" aria-label="Transpose ${S.esc(s.title)} up">+</button>
        ${st ? `<button type="button" data-tr="0" data-slug="${s.slug}" class="key-reset" aria-label="Back to original key" title="Original key (${S.esc(s.key || '')})">↺</button>` : ''}
      </span>`;
  }

  function transpose(slug, d) {
    const n = d === 0 ? 0 : S.normSteps((state.steps[slug] || 0) + d);
    if (n) state.steps[slug] = n; else delete state.steps[slug];
  }

  function setChanged() {
    el.result.hidden = true;
    save();
    renderSet();
    renderLibrary();
    updatePreviewButton();
  }

  function toggle(slug) {
    const i = state.set.indexOf(slug);
    if (i >= 0) {
      state.set.splice(i, 1);
    } else {
      state.set.push(slug);
      const s = state.bySlug.get(slug);
      C.toast(`Added “${s ? s.title : slug}” (${state.set.length})`);
    }
    setChanged();
  }

  /* ---------- link ---------- */

  function buildLink() {
    const base = new URL('book.html', location.href);
    base.search = '';
    base.hash = '';
    return `${base.href}?title=${encodeURIComponent(state.title.trim() || defaultTitle())}&songs=${state.set.map(slug => S.formatEntry(slug, state.steps[slug])).join(',')}`;
  }

  function makeLink() {
    if (!state.set.length) return;
    const url = buildLink();
    el.linkOut.value = url;
    el.openLink.href = url;
    el.share.hidden = !navigator.share;
    el.result.hidden = false;
    el.qr.innerHTML = '';
    if (window.QRCode) {
      try {
        const box = document.createElement('div');
        el.qr.appendChild(box);
        new window.QRCode(box, { text: url, width: 196, height: 196, colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      } catch (e) {
        el.qr.innerHTML = '<p class="status">Link is too long for a QR code — use Copy or Share instead.</p>';
      }
    }
    el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- preview ---------- */

  function updatePreviewButton() {
    if (!state.previewSlug) return;
    const inSet = state.set.includes(state.previewSlug);
    el.pvAdd.textContent = inSet ? 'Remove from songbook' : 'Add to songbook';
    el.pvAdd.classList.toggle('ghost', inSet);
    el.pvAdd.classList.toggle('primary', !inSet);
  }

  let previewSong = null;

  function renderPreviewSong() {
    const song = previewSong;
    if (!song) return;
    const st = state.steps[song.slug] || 0;
    el.pvMeta.textContent = [song.key && `Key ${S.transposeKey(song.key, st)}${st ? ` (${st > 0 ? '+' : ''}${st})` : ''}`, song.tempo && `${song.tempo} bpm`, song.author].filter(Boolean).join(' · ');
    const tr = song.hasChords ? `<div class="transpose" role="group" aria-label="Transpose">
        <span>Key <b>${S.esc(S.transposeKey(song.key, st) || '—')}</b></span>
        <button type="button" data-ptr="-1" aria-label="Transpose down a semitone">−</button>
        <button type="button" data-ptr="1" aria-label="Transpose up a semitone">+</button>
        ${st ? '<button type="button" data-ptr="0" aria-label="Back to original key">↺</button>' : ''}
      </div>` : '';
    el.pvBody.innerHTML = tr + S.renderLyrics(song, { chords: true, steps: st }) +
      (song.copyright ? `<p class="song-foot">${S.esc(song.copyright)}</p>` : '');
  }

  async function openPreview(slug) {
    state.previewSlug = slug;
    previewSong = null;
    const s = state.bySlug.get(slug);
    el.pvTitle.textContent = s ? s.title : slug;
    el.pvMeta.textContent = '';
    el.pvBody.innerHTML = '<p class="status">Loading…</p>';
    updatePreviewButton();
    if (typeof el.preview.showModal === 'function') el.preview.showModal();
    else el.preview.setAttribute('open', '');
    try {
      const song = await S.loadSong(slug);
      if (state.previewSlug !== slug) return;
      previewSong = song;
      renderPreviewSong();
    } catch (e) {
      el.pvBody.innerHTML = `<p class="status">${S.esc(e.message)}</p>`;
    }
  }

  function closePreview() {
    state.previewSlug = null;
    if (el.preview.open) el.preview.close();
  }

  /* ---------- mobile panel ---------- */

  function openPanel() {
    el.panel.classList.add('open');
    el.scrim.hidden = false;
  }
  function closePanel() {
    el.panel.classList.remove('open');
    el.scrim.hidden = true;
  }

  /* ---------- events ---------- */

  function bind() {
    el.search.addEventListener('input', () => { state.q = el.search.value; renderLibrary(); });

    el.tags.addEventListener('click', e => {
      const b = e.target.closest('[data-tag]');
      if (!b) return;
      state.tag = b.dataset.tag === state.tag ? '' : b.dataset.tag;
      renderTags();
      renderLibrary();
    });

    el.list.addEventListener('click', e => {
      const t = e.target.closest('[data-toggle]');
      if (t) return toggle(t.dataset.toggle);
      const p = e.target.closest('[data-preview]');
      if (p) openPreview(p.dataset.preview);
    });

    el.setList.addEventListener('click', e => {
      const tr = e.target.closest('[data-tr]');
      if (tr) {
        transpose(tr.dataset.slug, +tr.dataset.tr);
        setChanged();
        const again = el.setList.querySelector(`[data-tr="${tr.dataset.tr === '0' ? '1' : tr.dataset.tr}"][data-slug="${tr.dataset.slug}"]`);
        if (again) again.focus();
        return;
      }
      const mv = e.target.closest('[data-move]');
      if (mv) {
        const i = +mv.dataset.i, j = i + +mv.dataset.move;
        if (j < 0 || j >= state.set.length) return;
        [state.set[i], state.set[j]] = [state.set[j], state.set[i]];
        setChanged();
        const btn = el.setList.querySelector(`[data-move="${mv.dataset.move}"][data-i="${j}"]`);
        if (btn && !btn.disabled) btn.focus();
        return;
      }
      const rm = e.target.closest('[data-remove]');
      if (rm) { state.set.splice(+rm.dataset.remove, 1); setChanged(); }
    });

    el.title.addEventListener('input', () => { state.title = el.title.value; el.result.hidden = true; save(); });

    $('#clearSet').addEventListener('click', () => {
      if (!state.set.length) return;
      if (!confirm('Remove all songs from this songbook?')) return;
      state.set = [];
      setChanged();
    });

    el.make.addEventListener('click', makeLink);

    $('#copyLink').addEventListener('click', async () => {
      C.toast(await C.copyText(el.linkOut.value) ? 'Link copied' : 'Could not copy — select the link and copy it');
    });

    el.share.addEventListener('click', () => {
      navigator.share({ title: state.title, text: state.title, url: el.linkOut.value }).catch(() => {});
    });

    el.linkOut.addEventListener('focus', () => el.linkOut.select());

    el.pvAdd.addEventListener('click', () => { if (state.previewSlug) toggle(state.previewSlug); });
    el.preview.addEventListener('click', e => {
      const ptr = e.target.closest('[data-ptr]');
      if (ptr && previewSong) {
        transpose(previewSong.slug, +ptr.dataset.ptr);
        renderPreviewSong();
        if (state.set.includes(previewSong.slug)) setChanged();
        return;
      }
      if (e.target.closest('[data-close]') || e.target === el.preview) closePreview();
    });
    el.preview.addEventListener('close', () => { state.previewSlug = null; });

    $('#setFab').addEventListener('click', openPanel);
    $('#closeSet').addEventListener('click', closePanel);
    el.scrim.addEventListener('click', closePanel);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && el.panel.classList.contains('open')) closePanel();
    });

    $('#themeBtn').addEventListener('click', C.toggleTheme);
  }

  function suggestName(n) {
    return n.replace(/\.md$/i, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\(\d+\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.md';
  }

  /* ---------- start ---------- */

  async function init() {
    const title = cfg.siteTitle || 'Songbook';
    $('#siteTitle').textContent = title;
    document.title = title;
    restore();
    bind();
    renderSet();

    const sourceParam = new URLSearchParams(location.search).get('source') || '';
    try {
      const { songs, source, skipped } = await S.listSongs({ source: sourceParam });
      state.songs = songs;
      state.bySlug = new Map(songs.map(s => [s.slug, s]));
      el.status.hidden = true;
      el.source.textContent = `${songs.length} songs loaded from ${source}.`;
      if (skipped && skipped.length) {
        el.status.hidden = false;
        el.status.className = 'status warn';
        el.status.innerHTML = `<b>Skipped ${skipped.length} file${skipped.length > 1 ? 's' : ''}</b> because of the file name: ` +
          skipped.map(n => `<code>${S.esc(n)}</code>`).join(', ') +
          `. Rename to use only letters, numbers, - and _ (no spaces or brackets), e.g. <code>${S.esc(suggestName(skipped[0]))}</code>.`;
      }
      renderTags();
      renderLibrary();
      renderSet();
    } catch (e) {
      el.status.innerHTML = `<b>Couldn’t load the song list.</b> ${S.esc(e.message)}<br>
        If you are opening the file directly from your computer, run a local web server instead (see README), or add <code>songs/index.json</code>.`;
    }
    C.registerOffline();
  }

  init();
})();

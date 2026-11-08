/*
 * SongLib — shared song parsing, rendering, transposing and discovery.
 * Works in the browser (window.SongLib) and in Node (require) so the
 * index builder script uses exactly the same parser as the website.
 */
(function (root) {
  'use strict';

  const SONG_DIR = 'songs/';
  const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
  const CHORD_TOKEN = /(\[[^\]\n]*\])/;
  const HAS_CHORD = /\[[^\]\n]+\]/;
  const CHORD_RE = /^[A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+|-)?[0-9]*(?:(?:sus|add|maj|b|#)[0-9]+)*(?:\/[A-G][#b]?)?$/;

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function stripChords(line) {
    return line.replace(/\[[^\]\n]*\]/g, '');
  }

  const skipped = new Set();
  function noteSkipped(names) {
    names.forEach(n => {
      if (/\.md$/i.test(n) && !n.startsWith('_') && !isSongFile(n) && n !== 'README.md') skipped.add(n);
    });
  }

  function isSongFile(name) {
    return /\.md$/i.test(name) && !name.startsWith('_') && SLUG_RE.test(name.replace(/\.md$/i, ''));
  }

  function toSlug(name) {
    return name.replace(/\.md$/i, '');
  }

  /* ---------- parsing ---------- */

  function parseSong(text, slug) {
    text = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const meta = {};
    let body = text;
    const fm = text.match(/^---\n([\s\S]*?)\n---[ \t]*(\n|$)/);
    if (fm) {
      body = text.slice(fm[0].length);
      fm[1].split('\n').forEach(l => {
        const i = l.indexOf(':');
        if (i > 0) meta[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
      });
    }

    const sections = [];
    let cur = null;
    body.split('\n').forEach(raw => {
      const line = raw.replace(/\s+$/, '');
      const h = line.match(/^#+\s*(.*)$/);
      if (h) {
        cur = { label: h[1].trim(), lines: [] };
        sections.push(cur);
        return;
      }
      if (!cur) {
        if (!line.trim()) return;
        cur = { label: '', lines: [] };
        sections.push(cur);
      }
      cur.lines.push(line);
    });
    sections.forEach(s => {
      while (s.lines.length && !s.lines[s.lines.length - 1].trim()) s.lines.pop();
      while (s.lines.length && !s.lines[0].trim()) s.lines.shift();
    });

    const lyricLines = [];
    sections.forEach(s => s.lines.forEach(l => {
      const t = stripChords(l).replace(/\s+/g, ' ').trim();
      if (t) lyricLines.push(t);
    }));

    return {
      slug,
      title: meta.title || slug,
      author: meta.author || '',
      key: meta.key || '',
      tempo: meta.tempo || '',
      number: meta.number || '',
      copyright: meta.copyright || '',
      tags: (meta.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
      sections: sections.filter(s => s.lines.length || s.label),
      hasChords: HAS_CHORD.test(body),
      firstLine: lyricLines[0] || '',
      words: lyricLines.join(' ')
    };
  }

  /** The small record stored in songs/index.json and used by the picker. */
  function summarize(song) {
    return {
      slug: song.slug,
      title: song.title,
      author: song.author,
      key: song.key,
      number: song.number,
      tags: song.tags,
      hasChords: song.hasChords,
      firstLine: song.firstLine,
      words: song.words
    };
  }

  function sortSongs(list) {
    return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
  }

  /* ---------- transposing ---------- */

  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb

  function noteIndex(n) {
    let i = SHARP.indexOf(n);
    if (i < 0) i = FLAT.indexOf(n);
    return i;
  }

  function useFlats(key, steps) {
    const m = /^([A-G][#b]?)(m(?!aj))?/.exec(key || '');
    if (!m) return false;
    const idx = noteIndex(m[1]);
    if (idx < 0) return false;
    const t = (((idx + steps) % 12) + 12) % 12;
    return FLAT_MAJOR_KEYS.has(m[2] ? (t + 3) % 12 : t);
  }

  function transposeChord(chord, steps, flats) {
    if (!steps || !CHORD_RE.test(chord)) return chord;
    return chord.replace(/[A-G][#b]?/g, n => {
      const i = noteIndex(n);
      return i < 0 ? n : (flats ? FLAT : SHARP)[(((i + steps) % 12) + 12) % 12];
    });
  }

  function transposeKey(key, steps) {
    return key ? transposeChord(key, steps, useFlats(key, steps)) : key;
  }

  /** Keep a transposition between -5 and +6 semitones (the shortest way round). */
  function normSteps(n) {
    n = Math.round(Number(n) || 0);
    return ((((n % 12) + 12 + 5) % 12) - 5);
  }

  /** "slug~2" → { slug, steps: 2 }  (the format used inside songbook links) */
  function parseEntry(entry) {
    const [slug, st] = String(entry).trim().split('~');
    return { slug, steps: normSteps(st) };
  }

  function formatEntry(slug, steps) {
    const n = normSteps(steps);
    return n ? `${slug}~${n}` : slug;
  }

  /**
   * Transpose a whole song file (front matter "key:" plus every [chord]).
   * Used by the converter to save a song permanently in a new key.
   */
  function transposeText(text, steps) {
    steps = Number(steps) || 0;
    if (!steps) return text;
    const fm = String(text).match(/^(---\n[\s\S]*?\n---)/);
    const keyMatch = fm && fm[1].match(/^key:\s*(.+)$/m);
    const origKey = keyMatch ? keyMatch[1].trim() : '';
    let flats;
    if (origKey) flats = useFlats(origKey, steps);
    else {
      const first = (String(text).match(/\[([A-G][#b]?)[^\]]*\]/) || [])[1];
      flats = first ? useFlats(first, steps) : false;
    }
    let out = String(text).replace(/\[([^\]\n]+)\]/g, (m, c) => `[${transposeChord(c, steps, flats)}]`);
    if (origKey) out = out.replace(/^(---\n[\s\S]*?)^key:\s*(.+)$/m, (m, pre) => `${pre}key: ${transposeKey(origKey, steps)}`);
    return out;
  }

  /* ---------- rendering ---------- */

  function renderLine(line, opts) {
    if (!HAS_CHORD.test(line)) {
      return `<div class="line">${line.trim() ? esc(line) : '&nbsp;'}</div>`;
    }
    if (!opts.chords) {
      const plain = stripChords(line);
      return plain.trim() ? `<div class="line">${esc(plain.replace(/ {2,}/g, ' '))}</div>` : '';
    }
    const segs = [];
    let chord = null;
    line.split(CHORD_TOKEN).forEach(tok => {
      if (!tok) return;
      if (tok[0] === '[' && tok[tok.length - 1] === ']') {
        if (chord !== null) segs.push({ c: chord, t: '' });
        chord = tok.slice(1, -1);
      } else {
        const words = tok.match(/\s*\S+\s*/g) || [tok];
        words.forEach((w, i) => segs.push({ c: i === 0 ? chord : null, t: w }));
        chord = null;
      }
    });
    if (chord !== null) segs.push({ c: chord, t: '' });
    const html = segs.map(s =>
      `<span class="seg"><span class="ch">${s.c ? esc(transposeChord(s.c, opts.steps, opts.flats)) : ''}</span>` +
      `<span class="ly">${esc(s.t)}</span></span>`
    ).join('');
    const chordOnly = !stripChords(line).trim();
    return `<div class="line chorded${chordOnly ? ' chord-only' : ''}">${html}</div>`;
  }

  /**
   * Render a parsed song's lyrics as HTML.
   * opts: { chords: boolean, steps: number (semitones) }
   */
  function renderLyrics(song, opts) {
    const o = Object.assign({ chords: true, steps: 0 }, opts || {});
    o.flats = useFlats(song.key, o.steps);
    return song.sections.map(sec => {
      const body = sec.lines.map(l => renderLine(l, o)).join('');
      if (!body && !sec.label) return '';
      const isChorus = /chorus|refrain|reff?\b/i.test(sec.label);
      const label = sec.label ? `<h3 class="sec-label">${esc(sec.label)}</h3>` : '';
      return `<section class="sec${isChorus ? ' chorus' : ''}">${label}<div class="sec-body">${body}</div></section>`;
    }).join('');
  }

  /* ---------- discovery ---------- */

  function songUrl(slug) {
    return SONG_DIR + encodeURIComponent(slug) + '.md';
  }

  async function loadSong(slug) {
    if (!SLUG_RE.test(slug)) throw new Error(`"${slug}" is not a valid song id`);
    const res = await fetch(songUrl(slug), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Song "${slug}" was not found (${res.status})`);
    return parseSong(await res.text(), slug);
  }

  function githubRepo() {
    const cfg = (root.SONGBOOK_CONFIG && root.SONGBOOK_CONFIG.github) || {};
    if (cfg.repo) return { repo: cfg.repo, branch: cfg.branch || '' };
    if (typeof location === 'undefined') return null;
    const m = /^([^.]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return null;
    const first = location.pathname.split('/').filter(Boolean)[0];
    const name = first && !/\.html?$/i.test(first) ? first : location.hostname;
    return { repo: `${m[1]}/${name}`, branch: '' };
  }

  async function listFromIndex() {
    const res = await fetch(SONG_DIR + 'index.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.songs) ? data.songs : null;
  }

  async function listFromGitHub() {
    const gh = githubRepo();
    if (!gh) return null;
    const url = `https://api.github.com/repos/${gh.repo}/contents/songs` +
      (gh.branch ? `?ref=${encodeURIComponent(gh.branch)}` : '');
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const files = await res.json();
    const names = files.filter(f => f.type === 'file').map(f => f.name);
    noteSkipped(names);
    return names.filter(isSongFile).map(toSlug);
  }

  async function listFromDirectory() {
    const res = await fetch(SONG_DIR, { cache: 'no-cache' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const names = [...doc.querySelectorAll('a[href]')].map(a => {
      const parts = a.getAttribute('href').split('?')[0].split('/').filter(Boolean);
      try { return decodeURIComponent(parts.pop() || ''); } catch (e) { return ''; }
    });
    noteSkipped(names);
    return [...new Set(names.filter(isSongFile).map(toSlug))];
  }

  async function summariesFor(slugs) {
    const out = await Promise.all(slugs.map(s => loadSong(s).then(summarize).catch(() => null)));
    return out.filter(Boolean);
  }

  /**
   * Find every song in the songs/ folder.
   * Order: songs/index.json → GitHub folder listing → web-server folder listing.
   * With { live: true } the folder is read directly first (skipping index.json).
   */
  function isLocalAddress() {
    if (typeof location === 'undefined') return false;
    const h = location.hostname;
    return h === 'localhost' || h === '' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.local$/.test(h) || h === '[::1]';
  }

  async function listSongs(options) {
    // On your own computer, always read the folder directly so new files show up without rebuilding index.json.
    const live = !!(options && options.live) || isLocalAddress();
    const strategies = [
      { name: 'songs/index.json', run: listFromIndex, summaries: true },
      { name: 'GitHub folder', run: listFromGitHub },
      { name: 'folder listing', run: listFromDirectory }
    ];
    if (live) strategies.push(strategies.shift());
    for (const s of strategies) {
      let found = null;
      try { found = await s.run(); } catch (e) { found = null; }
      if (!found || !found.length) continue;
      const songs = s.summaries ? found : await summariesFor(found);
      if (songs.length) return { songs: sortSongs(songs), source: s.name, skipped: [...skipped].sort() };
    }
    throw new Error('No songs were found in the songs/ folder.');
  }

  const api = {
    SONG_DIR, SLUG_RE, esc, parseSong, summarize, sortSongs, isSongFile, toSlug,
    CHORD_RE, transposeChord, transposeKey, normSteps, parseEntry, formatEntry, transposeText, renderLyrics, loadSong, listSongs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SongLib = api;
})(typeof window !== 'undefined' ? window : globalThis);

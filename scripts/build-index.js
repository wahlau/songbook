#!/usr/bin/env node
/*
 * Rebuilds songs/index.json from every *.md file in songs/.
 * Run it after adding or editing songs:   node scripts/build-index.js
 * (The GitHub Action in .github/workflows runs this for you on every push.)
 * No dependencies — uses the same parser as the website (js/songs.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const SongLib = require('../js/songs.js');

const dir = path.join(__dirname, '..', 'songs');
const all = fs.readdirSync(dir).filter(f => /\.md$/i.test(f) && !f.startsWith('_'));
const bad = all.filter(f => !SongLib.isSongFile(f));
const files = all.filter(SongLib.isSongFile).sort();

bad.forEach(f => console.warn(`! Skipped "${f}": file names may only use letters, numbers, - and _ (no spaces).`));

const songs = SongLib.sortSongs(files.map(f => {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const song = SongLib.parseSong(text, SongLib.toSlug(f));
  if (!/^---\s*\n[\s\S]*?\btitle\s*:/i.test(text.replace(/\r/g, ''))) {
    console.warn(`! "${f}" has no title — using the file name.`);
  }
  return SongLib.summarize(song);
}));

const out = path.join(dir, 'index.json');
fs.writeFileSync(out, JSON.stringify({ count: songs.length, songs }, null, 2) + '\n');
console.log(`✓ Wrote songs/index.json with ${songs.length} song${songs.length === 1 ? '' : 's'}.`);

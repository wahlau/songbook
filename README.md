# Praise & Worship Songbook

A small, no-build website for putting together a **one-off songbook** for a praise and worship session.

1. Open the site and pick songs from the library.
2. Put them in order and give the songbook a title.
3. Tap **Create songbook link**, then share the link (or show the QR code) to musicians and singers.
4. Everyone opens the link on a phone or tablet and gets the songs in that order, one per screen.

The songs that come with this repo are **made-up demo songs** for testing. Replace them with your own.

---

## Features

**Song picker (`index.html`)**
- Lists every song in the `songs/` folder automatically.
- Search by title, author, tag or any line of the lyrics. Filter by tag.
- Preview a song before adding it.
- Reorder with ↑ ↓ and remove with ✕. Your choices are kept if you reload the page.
- **Choose a key for each song** with − / + (songs with chords only). The key is saved in the share link, so everyone opens the song in the same key. ↺ goes back to the original key. You can also transpose in the preview pop-up.
- Creates a share link, with Copy, Share (on phones) and a QR code.

**Songbook view (`book.html`)**
- One song per screen. Use **Next / Previous**, swipe, or the ← → keys (most Bluetooth page-turner pedals work).
- Contents menu to jump to any song.
- Larger / smaller text, light / dark theme, chords on / off.
- **Transpose** each song up or down; the chords and key change to match. The book opens in the keys picked in the song picker, and each person can still change the key on their own device.
- Keeps the screen awake (on browsers that support it).
- **Print or save as PDF**: a cover page with the song list, then one song per page.
- Works offline once a songbook link has been opened (useful on weak church Wi-Fi).
- "Edit songs in this book" sends you back to the picker with the same songs loaded.

---

## Adding a song

1. Copy `songs/_TEMPLATE.md` and rename the copy, e.g. `songs/great-is-your-love.md`.
   - Use only **lowercase letters, numbers and dashes**. No spaces.
   - The file name is the song's id inside share links, so don't rename it once you've shared links that use it.
2. Edit the file:

```text
---
title: Morning Lantern
author: Demo Writer
key: G
tempo: 76
tags: opening, praise
number: 12
copyright: CCLI / licence line (optional)
---
# Intro
[G] [C] [G] [D]

# Verse 1
[G]Wake, my soul, the [C]dawn is [G]breaking,
[Em]light is spilling [D]through the door;

# Chorus
Lines without square brackets are plain lyrics.
```

| Part | Notes |
|---|---|
| Lines between `---` | Song details. Only `title` is required. `tags` are comma-separated and become filter buttons. |
| `# Something` | Starts a section (Verse 1, Chorus, Bridge…). Sections called *Chorus* or *Refrain* are indented. |
| `[G]`, `[F#m]`, `[D/F#]` | A chord, placed just before the syllable it belongs to. Songs with no chords at all are fine. |
| `(x2)` | Use **round** brackets for notes like repeats. Square brackets always mean chords. |

Files whose names start with `_` are ignored, so the template never shows up in the library.

3. Commit and push. The song shows up in the library on its own (see below).

You can add songs straight on github.com: open the `songs` folder, choose **Add file → Create new file**, paste the template, edit it, and commit.

---

## Publishing on GitHub Pages

1. Create a new repository on GitHub and upload everything in this folder, **including** the hidden `.nojekyll` file and the `.github` folder.
2. In the repo, go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, pick `main` and `/ (root)`, then save.
3. Go to **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions**, and save. This lets the song index update itself.
4. After a minute your site is live at `https://<your-username>.github.io/<repo-name>/`.

Edit `config.js` to change the site name and the default songbook title.

### How the site finds the songs

GitHub Pages can't list the files in a folder by itself, so the site tries three ways in order:

1. **`songs/index.json`**: a list of every song. A GitHub Action (`.github/workflows/update-song-index.yml`) rebuilds it each time you push a change to `songs/`, so new songs appear about a minute after you commit.
2. **GitHub API**: if the index is missing, the site reads the `songs/` folder of your repo directly. This works when the site is at `*.github.io`. For a custom domain, set `github.repo` in `config.js`.
3. **Folder listing**: when you run a local web server (below), the site reads the folder directly.

Add `?source=live` to the picker address (e.g. `…/index.html?source=live`) to skip the index and read the folder directly.

To rebuild the index by hand: `node scripts/build-index.js` (needs Node.js; nothing to install).

### Share link format

```
book.html?title=Sunday%20Evening&songs=morning-lantern,quiet-harbor,go-out-in-peace
```

A song in a different key has `~` and the number of semitones after its id, e.g. `morning-lantern~2` (2 semitones up) or `quiet-harbor~-3` (3 down).

The link only holds the song ids, keys and the title. Songs load from the site each time it opens, so a fix to a song appears in links you've already shared. Adding `#3` to the end opens the book at the third song.

---

## Trying it on your computer

Browsers block reading files when you double-click `index.html`, so start a tiny web server in this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

To try it on a phone or tablet on the same Wi-Fi, open `http://<your-computer's-IP>:8000`.

---

## Files

```
index.html            Song picker
book.html             Songbook view (what the share link opens)
config.js             Site name and settings
css/style.css         All styles (light, dark and print)
js/songs.js           Song parsing, chords, transposing, finding songs
js/builder.js         Song picker logic
js/book.js            Songbook view logic
js/common.js          Shared helpers
sw.js                 Offline support
songs/*.md            One file per song
songs/_TEMPLATE.md    Copy this to add a song
songs/index.json      Auto-generated list of songs
scripts/build-index.js
.github/workflows/update-song-index.yml
```

## Copyright reminder

Only add songs you have the right to show. For copyrighted worship songs, check your church's licence (e.g. CCLI) and put the licence line in the `copyright:` field.

---

## Converting a chord sheet (`convert.html`)

Many chord sites show chords on their own line above the words. To turn one of those into a song file:

1. Open `convert.html` (there's a link at the bottom of the song picker).
2. Fill in the title and other details, then paste the chord sheet.
3. Check the result and the preview, then click **Download .md** and put the file in `songs/`.

Section names like Intro, Verse, Bait, Chorus, Reff, Bridge and Interlude become headings. The key is taken from the first chord if you leave it blank. Use the **Key − / +** buttons to transpose the whole song before you download it, which saves the file permanently in the new key. Only add songs your church is licensed to use.

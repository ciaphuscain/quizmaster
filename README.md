# Quizmaster Studio

A local-first, professional authoring studio for quizmasters. Create, edit, organise, present, import and export thousands of quiz questions across 13 game modes — entirely in your browser, offline, with no accounts, subscriptions or paid APIs.

## Features at a glance

- **13 game modes**, each with a dedicated authoring panel:
  Logo (normal), Logo (altered, 25-effect pipeline), Country flag, Country border, Country neighbours, Silhouette (thing/person), Movie emojis, Movie bad plot, Movie famous dialogue, Movie props, Movie search history, Movie another perspective, Song backwards.
- **Editor**: three-panel workspace, canvas with drag/resize/rotate, snapping + alignment guides, grid, safe-area guides, zoom/pan, 16:9 / 4:3 / square / custom canvases, layers (rename, reorder, lock, hide, group, duplicate), undo/redo, copy/paste, rich text (Tiptap), keyboard shortcuts (`?` in the editor).
- **Image Studio**: non-destructive effect pipeline (add/remove/disable/reorder/reset, presets, original-vs-altered compare), brush / polygon / rectangle / ellipse masks for selective blur, pixelate, hide, reveal and erase, local automatic background removal, silhouettes, PNG/JPEG export.
- **Audio Studio**: waveform, ruler, playhead, range selection, trim, delete, split, reverse (whole or selection), fades, gain, speed, loop, preview original vs edited, WAV export. Operations are stored separately; the original file is never modified.
- **Real geography**: Natural Earth 1:50m geometry, validated land-border adjacency, multiple projections, island handling, offline flags.
- **Question bank** (virtualised, 10,000+ questions), media library (SHA-256 deduplication, reference tracking), collections, templates (31 built-in + your own), quizzes with rounds (drag and drop).
- **Live presentation**: host view with private answers/notes/timer/hints and a separate audience window synchronised over `BroadcastChannel`. The audience only ever receives revealed information.
- **Import/export**: portable ZIP packages (validated on import), full backups, JSON, PNG, PDF question sheet and answer key, PowerPoint.
- **Autosave** with retry and conflict detection, persistent revision history, crash recovery.
- **Optional AI** (Ollama, Claude via a local proxy, or any OpenAI-compatible local server). Suggestions are always reviewable and never saved unless accepted.

## Installation (Windows, macOS, Linux)

Requirements: [Node.js 20+](https://nodejs.org) and a modern browser (Chrome, Edge or Firefox).

```bash
npm install
```

```bash
npm run build
```

```bash
npm run preview
```

Open http://localhost:4173. After the first load the app is cached by a service worker and works offline; you can also use the browser's "Install app" button to run it as a desktop-style window.

For development with hot reload:

```bash
npm run dev
```

### Your data

Everything is stored in your browser's IndexedDB for this site/origin. Use **Import / Export → Full backup** regularly (the dashboard reminds you), and **Request persistence** to ask the browser not to evict storage. Clearing site data deletes your library.

## Using the app

1. **Create Question** → pick a game mode → *Create blank* or choose a template. The Dashboard's *Quick create* buttons do the same in one click.
2. Use the **game tab** (right panel) for the mode's specialised tools, the **Question** tab for answer, alternatives, hints, difficulty, points, time limit, tags, collections and notes, and the **Element** tab for the selected layer.
3. Changes autosave (status in the toolbar). `Ctrl+S` saves immediately and records a revision you can restore later.
4. **Round Builder** → create a quiz, add rounds, drag questions in, set scoring and time limits, then **Start presentation**.
5. In the host view click **Open audience window**, move it to the projector and press `F`. Default keys: `Space` next action, `→`/`←` next/previous, `A` answer, `H` hint, `T` timer, `P` audio, `F` fullscreen, `Esc` exit fullscreen (configurable in Settings).

### Optional AI assistant

AI is disabled by default and nothing depends on it.

- **Ollama**: install Ollama, run a model, start it with `OLLAMA_ORIGINS=http://localhost:4173` and select *Ollama* in Settings.
- **Claude**: run the local proxy so your API key never reaches the browser, then select *Claude via local proxy* in Settings:

  ```bash
  ANTHROPIC_API_KEY=your-key npm run ai-proxy
  ```

  The proxy uses the official Anthropic SDK (model `claude-opus-5-5`, server-side refusal fallback enabled) and only accepts requests from the app's local origins.
- **Other**: any OpenAI-compatible local server (e.g. LM Studio).

## Portable package format

`.quizmaster.zip` files contain:

```
manifest.json            format, formatVersion, appVersion, createdAt, kind, counts, assets[] (id, sha256 hash, path, mime, size…)
questions.json           Question[] (full structured data: scene layers, effects, masks, audio operations…)
quiz.json                { quizzes, rounds, refs }   (when exporting a quiz or backup)
collections.json         Collection[]                (optional)
templates/templates.json Template[]                  (optional)
assets/<sha256>.<ext>    original media bytes
```

Imports are validated (format version, ZIP structure and safe paths, Zod schemas, file types, size limits, SHA-256 hashes, references, duplicate ids) before anything is written. Existing records are never overwritten: conflicting ids import as copies and identical media is reused.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check (strict) and production build |
| `npm run preview` | Serve the production build on port 4173 |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright; builds must exist — run `npm run build` first) |
| `npm run ai-proxy` | Optional local Claude proxy |
| `node scripts/build-countries.mjs` | Regenerate the validated country dataset |

## Data sources and licences

- Country geometry: Natural Earth 1:50m (public domain) via `world-atlas` (ISC).
- Country metadata and land-border adjacency: `world-countries` (mledoze/countries, ODbL 1.0). One documented correction is applied (Sri Lanka–India is maritime, not a land border).
- Flags: `flag-icons` (MIT).
- Emoji data: `emojibase-data` (MIT). Emoji glyphs are drawn with your operating system's emoji font.
- No third-party logos or brand assets are bundled. You supply your own media.

See `DECISIONS.md` for architecture choices and `TASKS.md` for the feature status and known limitations.

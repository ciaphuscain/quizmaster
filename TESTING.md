# Testing

## How to run
```bash
npm test            # Vitest unit + integration (jsdom / node + fake-indexeddb)
npm run build       # strict type-check + production build (required before e2e)
npm run e2e         # Playwright against `vite preview` (Chromium)
```
Fixtures for E2E are generated deterministically by `node e2e/fixtures/make-fixtures.mjs` (committed outputs: logo.png, subject.png, prop.png, tone.wav — stereo, 22.05 kHz, left channel fading in and right channel fading out so reversal and channel order are detectable).

## Latest results (2026-11-18)

### Unit & integration — 69 passed (7 files)
- `engines/image/__tests__/effects.test.ts` — geometry (mirror, 180°, 90° rotate with expansion, crop, zoom, homography, perspective), blur/pixelate (variance checks; slider changes output), colour effects, masks (polygon, brush, subtract, invert), selective effects, hide, erase, effect ordering, disabled effects / original untouched, all 25 effect types execute, auto cutout, manual mask subtract, silhouette + outline.
- `engines/audio/__tests__/audio.test.ts` — per-channel reversal without channel swap, ranged reversal, trim, delete, gain (dB), fades, speed, loop, ordered op pipeline with disabled op, WAV header validity and round trip.
- `engines/geography/__tests__/geo.test.ts` — dataset coverage/uniqueness, search by name/alias/code, real & symmetric adjacency, no-border countries (incl. corrected Sri Lanka), status classification, metadata↔geometry linkage, multipolygon island filtering (France keeps Corsica, drops overseas parts).
- `utils/answers.test.ts` — answer normalisation, alternatives, alias dedupe.
- `db/__tests__/repositories.test.ts` — all 13 game types persist, validation rejects mismatched content, versioning + conflict detection, revisions + restore, duplicate/archive/restore/delete, filtering, asset dedupe + reference protection + shared media kept on delete, built-in templates for all modes, template application without mutation, user templates, audio templates, collections, quiz/round building + moving + duplicating + multi-quiz membership, ZIP round trip into a clean DB, tampered/malformed package rejection.
- `db/__tests__/performance.test.ts` — 10,000 questions: load summaries ≈ 50 ms, search+filter+sort ≈ 8 ms.
- `features/presentation/model.test.ts` — slide building, answer/aliases/notes/unrevealed hints absent from public state before reveal, present after, Space action sequence.

### End-to-end (Playwright, Chromium) — 16 passed, 1 skipped (manual screenshot helper)
| Spec | Covers |
|---|---|
| smoke | every page loads; all 13 game editors open and save; no page errors |
| flows 1 | normal logo one-click upload; canvas changes; bank shows it |
| flows 2+3 | altered logo: blur + rotation added, slider changes pixels, undo/redo restore exact canvas pixels, answer/alias/difficulty, reload restores everything, stored original bytes equal the fixture |
| flows 4 | country outline renders real geometry; island filter changes output; answer auto-filled |
| flows 5 | Austria's 8 real neighbours listed; Iceland flagged "no land borders" |
| flows 6 | silhouette auto cutout; compare with source; brush mask in Image Studio changes output |
| flows 7 | emoji paste + picker create emoji layers; keyboard nudge moves element |
| flows 8 | three props uploaded, grid layout; duplicate image deduplicated by hash |
| flows 9 | search-history entries, simulated dates, progressive reveal, reorder |
| flows 10 | WAV import, waveform range selection, reverse selection, exported WAV: valid header, stereo + sample rate preserved, samples reversed per channel inside range only |
| flows 11–15 | three questions, quiz with two rounds via drag & drop, host + audience windows, hints, answers hidden until reveal (BroadcastChannel traffic inspected — answers never sent early), audience reconnect after refresh, ZIP export, import into a clean DB, media/rounds/hints survive |
| exports | PNG (1920 wide), PDF question sheet, PDF answer key, PPTX (3 slides, media, answer in notes) |
| templates | save question as template, create from it, appears in "recently used" |
| canvas | mouse drag moves element, corner handle resizes, autosave persists across reload |
| a11y | axe-core audit (incl. colour contrast): no serious/critical violations on dashboard, bank, create, media, round builder, templates, import/export, settings, editor |
| offline | after first load, with network disabled: navigate, create question, load geometry, autosave |

### Manual checks performed
- Visual review of dashboard, altered-logo editor (mirror + rotate output), neighbours map (Germany: 9 real neighbours, labelled, hidden target), silhouette (auto cutout), search history card.

### Not covered by automation
- Live AI providers (no credentials in CI); long (multi-minute) audio performance; Firefox/Safari runs.

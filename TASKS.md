# Feature checklist

States: **Tested** (implemented and covered by automated tests) · **Implemented** (works, verified manually or indirectly, no dedicated automated test) · **Blocked** (with explanation).

## Foundation
| Feature | State | Evidence |
|---|---|---|
| Vite + React 19 + strict TypeScript + Router, Tailwind v4, Radix, Lucide, Zustand, Dexie, Zod | Tested | `npm run build` (strict `tsc -b`) |
| Dark/light themes, reduced motion, settings persistence | Implemented | |
| Dexie schema v1 → v2 migration | Implemented | migration code in `src/db/database.ts` |
| Error boundary, toasts, confirmations for destructive actions | Implemented | |

## Question management
| Feature | State | Evidence |
|---|---|---|
| CRUD, duplicate, archive/restore, bulk edit/delete/duplicate/tag | Tested | `repositories.test.ts` |
| Validation of all 13 content schemas | Tested | `repositories.test.ts` |
| Search, filters (game, difficulty, status, tags, collection), sort | Tested | `repositories.test.ts`, `performance.test.ts` |
| Virtualised list + thumbnails for 10k questions | Tested | 10k filter+sort ≈ 8 ms (`performance.test.ts`); list uses @tanstack/react-virtual |
| Autosave (debounced, status, retry, unsaved-change flush, recovery after reload) | Tested | E2E flows 2+3, canvas test |
| Conflict detection (no silent overwrite) | Tested | `repositories.test.ts` |
| Revision history + restore | Tested | `repositories.test.ts` |
| Collections (many-to-many) | Tested | `repositories.test.ts` |

## Editor
| Feature | State | Evidence |
|---|---|---|
| Three-panel layout, toolbar, save status, preview controls | Tested | smoke + flows |
| Canvas drag, resize handles, rotate handle, snapping & guides | Tested (drag/resize) / Implemented (rotate, guides) | `canvas-offline.spec.ts` |
| Zoom/pan, grid, safe area, 16:9 / 4:3 / square / custom | Implemented | |
| Layers: add/delete/duplicate/rename/reorder/hide/lock/group | Implemented | |
| Undo/redo with coalescing affecting canvas | Tested | flow 2+3 |
| Copy/paste, keyboard shortcuts ignored while typing | Implemented | |
| Rich text (Tiptap) with fonts, colours, spacing, bullets, emoji, overflow shrink | Implemented | |
| Templates: built-in for all 13 games, save/apply/duplicate/rename/delete/import/export, no template mutation | Tested | `repositories.test.ts`, `exports.spec.ts` |
| Progressive reveal steps & answer-only layers | Tested | presentation model tests |
| Per-layer reveal animations (fade, zoom, slide up/left, pop, none) used by the audience slide | Tested | `model.test.ts`, `finish.spec.ts` |

## Image processing
| Feature | State | Evidence |
|---|---|---|
| All 25 effects produce real output | Tested | `effects.test.ts` (each effect + specific assertions) |
| Ordered pipeline (add/remove/disable/reorder/reset), presets, compare | Tested | `effects.test.ts`, flow 2+3 |
| Brush / polygon / rect / ellipse masks, add/subtract/invert/undo | Tested | `effects.test.ts`, flow 6 |
| Selective blur/pixelate/hide/reveal/erase | Tested | `effects.test.ts` |
| Automatic background removal (local), manual cutout, feather | Tested | `effects.test.ts`, flow 6 |
| Silhouette colour, smoothing, outline, shadow | Tested | `effects.test.ts`, flow 6 |
| PNG / JPEG / transparent PNG / 2× export of processed image | Implemented | Image Studio |
| Question image export: PNG, transparent PNG, JPEG, custom width (64–8192 px), reveal state, answer banner | Tested | `finish.spec.ts`, `exports.spec.ts` |
| Media library thumbnails (generated 256 px, stored separately; lists never load originals) | Tested | `finish.spec.ts` |
| Effects in Web Worker | Implemented | `src/workers/imageWorker.ts` |
| Pixel-level free-transform within the Image Studio | Implemented via effects (crop/rotate/perspective/distort/zoom) and canvas transforms |

## Game modes
| Mode | State | Evidence |
|---|---|---|
| 1 Logo normal (one-click upload) | Tested | flow 1 |
| 2 Logo altered | Tested | flow 2+3 |
| 3 Country flag | Tested | flow 11–15, exports |
| 4 Country border | Tested | flow 4 |
| 5 Country neighbours (incl. no-border cases) | Tested | flow 5, `geo.test.ts` |
| 6 Silhouette | Tested | flow 6 |
| 7 Movie emojis | Tested | flow 7, canvas test |
| 8 Movie bad plot (variants, styles, tones, clue cards, length limit, AI drafting) | Implemented (AI path: Implemented, untested against live providers) | template test |
| 9 Movie dialogue (lines, speakers, styles, attribution, optional audio) | Tested | flow 11–15 |
| 10 Movie props | Tested | flow 8 |
| 11 Movie search history (1–20 entries) | Tested | flow 9 |
| 12 Movie another perspective (narrator, categories, tones, paragraphs, variants) | Implemented | smoke |
| 13 Song backwards | Tested | flow 10 |

## Audio
| Feature | State | Evidence |
|---|---|---|
| Decode, waveform, playback, seek, scrub (drag on the time ruler), range select, zoom | Tested | flow 10, `finish.spec.ts` |
| Trim, delete, split markers, reverse (per channel, range), gain, fades (fixed length or across the selection), speed, loop | Tested | `audio.test.ts`, flow 10 |
| Non-destructive op list (reorder/disable/remove) | Tested | `audio.test.ts` |
| WAV encoding/export (sample rate & channels preserved) | Tested | `audio.test.ts`, flow 10 |
| MP3 export | Blocked — no MP3 encoder bundled by design; WAV only (documented) | |
| Audio processing off the main thread | Implemented | `src/workers/audioWorker.ts` (main-thread fallback) |

## Organisation & presentation
| Feature | State | Evidence |
|---|---|---|
| Quizzes, rounds (create/rename/delete/duplicate/reorder), drag questions between rounds, scoring rules, time limits, transitions, preview | Tested | `repositories.test.ts`, flow 11–15 |
| Host controls: next/prev/skip/jump, hints, answer, timer start/pause/reset, audio, end | Tested (core) | flow 11–15 |
| Dual-screen audience window, reconnect after refresh, connection status | Tested | flow 11–15 |
| Answers never transmitted before reveal | Tested | `model.test.ts`, flow 11–15 (channel interception) |
| Configurable shortcuts | Implemented | Settings |

## Import / export
| Feature | State | Evidence |
|---|---|---|
| ZIP package export/import with validation | Tested | `repositories.test.ts`, flow 11–15 |
| Full backup, storage estimate, persistence request, backup reminder | Implemented | |
| JSON export/import | Implemented | |
| PNG, PDF sheet, PDF answer key, PPTX (with notes & audio) | Tested | `exports.spec.ts` |

## AI (optional)
| Feature | State | Evidence |
|---|---|---|
| Provider abstraction (Ollama, Claude via local proxy, OpenAI-compatible) | Tested (client side) | `finish.spec.ts` with a mocked local endpoint; live providers not exercised (no credentials) |
| Review/edit/accept/reject UI; saved only when accepted; app fully usable with AI disabled | Tested | `finish.spec.ts` (accept subset, edit, reject; disabled = no AI buttons, no external requests) |

## Hardening
| Feature | State | Evidence |
|---|---|---|
| Offline after install (service worker) | Tested | `canvas-offline.spec.ts` |
| Accessibility (labels, focus rings, keyboard flows, contrast) | Tested | `a11y.spec.ts` — axe: no serious/critical violations (incl. colour contrast) on 8 pages + editor |

## Known limitations / next steps
1. Automatic cutout is colour/flood-fill based, not ML segmentation (see DECISIONS D3).
2. Waveform peak computation for very long files still runs on the main thread.
3. Emoji appearance depends on the operating system's emoji font.
4. PPTX slides are rendered images (layout-faithful, not individually editable shapes); reveal steps are flattened.
5. Undo history is per editing session (persistent revisions cover longer-term recovery).
6. Accessibility audit is automated for main screens only (not every dialog state).

# Plan & architecture

## Layers
```
src/
  types/schema.ts          Zod schemas = single source of truth (13-mode discriminated union)
  db/                      Dexie database (versioned) + repositories (questions, assets, templates, collections, quizzes, settings)
  engines/
    image/                 raster ops, 25 effects, vector masks, cutout, silhouette, pipeline (pure; also run in workers/)
    audio/                 PCM ops, WAV codec, decoding, clip processing (memoised)
    geography/             country metadata, adjacency, Natural Earth geometry, island filtering
    rendering/             scene renderer (all layer kinds), rich text layout, asset/processed-image caches
    export/                ZIP package build/validate/import, JSON, PDF, PPTX
    scene/                 layer factories, scene utilities
  games/                   registry (metadata, default scenes/content), presets, built-in templates, template application, 13 game panels
  components/              ui kit (Radix + Tailwind), editor canvas + geometry, common pickers
  features/                pages: dashboard, question bank, editor, media library, collections, round builder, templates, presentation, import/export, settings, AI
  stores/                  zustand: editor (draft, history, selection), settings
  hooks/                   autosave, hotkeys, asset URLs
  workers/                 image processing worker
server/ai-proxy.mjs        optional local Claude proxy
e2e/                       Playwright specs + deterministic fixtures
```

## Phases (all executed)
1. Foundation — project, schemas, database, layout, settings.
2. Question management — CRUD, search, filters, collections, autosave, revisions.
3. Editing infrastructure — canvas stage, layers, inspector, undo/redo, templates.
4. Image engine — effects, masks, cutout, silhouette, worker.
5–8. Game modes — logos, geography, silhouette, six movie modes.
9. Audio — decoding, operations, waveform studio, WAV export, backwards song mode.
10. Organisation — quizzes, rounds, drag and drop, bulk editing.
11. Presentation — public-state model, host view, audience window, timers, shortcuts.
12. Import/export — ZIP, backup, JSON, PNG, PDF, PPTX.
13. AI — optional providers + review UI.
14. Hardening — unit, integration, E2E, performance (10k), offline, production build.

Status of every feature: see `TASKS.md`. Decisions: `DECISIONS.md`. Test results: `TESTING.md`.

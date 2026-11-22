import { geoPath, geoCentroid, geoEqualEarth, geoMercator, geoNaturalEarth1, geoOrthographic, geoAzimuthalEqualArea, geoConicEqualArea, type GeoProjection } from 'd3-geo';
import type { Background, CountryLayer, DialogueLayer, ImageLayer, Layer, Scene, SearchLayer, ShapeLayer } from '@/types/schema';
import { drawRichText, roundRect, wrapLines } from './text';
import { getAssetImage, getProcessedImage, imageSize, loadImageUrl } from './assets';
import { loadGeo, filterIslands, largestPart, type GeoData, type CountryFeature } from '@/engines/geography/geo';
import { getCountry, flagUrl, getLandNeighbors, nearbyCountries, countryByGeometryId } from '@/engines/geography/countries';

export type RenderState = {
  /** progressive reveal step currently shown (Infinity in the editor) */
  revealStep: number;
  answerRevealed: boolean;
  /** editor only: draw answer-only / not-yet-revealed layers semi-transparent */
  ghostHidden?: boolean;
  /** draw an answer banner into the image (exports) */
  answerBanner?: string | null;
  /** skip the slide background (transparent PNG export) */
  transparentBackground?: boolean;
  hideLayerIds?: Set<string>;
};

export type Resources = {
  images: Map<string, CanvasImageSource | null>;
  background: CanvasImageSource | null;
  flags: Map<string, HTMLImageElement | null>;
  geo: GeoData | null;
};

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif';

/** Loads everything needed to draw a scene synchronously. Results are cached by the asset layer. */
export async function prepareScene(scene: Scene, state: RenderState): Promise<Resources> {
  const res: Resources = { images: new Map(), background: null, flags: new Map(), geo: null };
  const jobs: Promise<unknown>[] = [];
  if (scene.background.type === 'image' && scene.background.assetId)
    jobs.push(getAssetImage(scene.background.assetId).then((i) => { res.background = i; }));
  let needGeo = false;
  for (const l of scene.layers) {
    if (l.kind === 'image' && l.assetId) {
      const original = state.answerRevealed && l.revealOriginalOnAnswer;
      const cfg = original ? { assetId: l.assetId, cutout: l.silhouette?.enabled ? l.cutout : undefined, effects: [], silhouette: undefined } : l;
      jobs.push(getProcessedImage(cfg).then((i) => { res.images.set(l.id, i); }));
    }
    if (l.kind === 'country' && l.iso3) {
      if (l.display === 'flag') {
        const c = getCountry(l.iso3);
        const url = c && flagUrl(c.iso2, l.flag.aspect);
        if (url && c) jobs.push(loadImageUrl(url).then((i) => res.flags.set(c.iso2, i)).catch(() => res.flags.set(c.iso2, null)));
      } else needGeo = true;
    }
  }
  if (needGeo) jobs.push(loadGeo().then((g) => { res.geo = g; }));
  await Promise.all(jobs);
  return res;
}

export function isLayerShown(l: Layer, state: RenderState): 'show' | 'ghost' | 'hide' {
  if (!l.visible || state.hideLayerIds?.has(l.id)) return 'hide';
  const hidden = (l.answerOnly && !state.answerRevealed) || l.revealStep > state.revealStep;
  if (!hidden) return 'show';
  return state.ghostHidden ? 'ghost' : 'hide';
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, res: Resources, state: RenderState) {
  ctx.save();
  if (!state.transparentBackground) drawBackground(ctx, scene.width, scene.height, scene.background, res.background);
  for (const l of scene.layers) {
    const vis = isLayerShown(l, state);
    if (vis === 'hide') continue;
    const t = l.transform;
    ctx.save();
    ctx.globalAlpha = t.opacity * (vis === 'ghost' ? 0.3 : 1);
    ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
    ctx.translate(-t.w / 2, -t.h / 2);
    if (l.shadow && l.shadow.blur + Math.abs(l.shadow.x) + Math.abs(l.shadow.y) > 0) {
      ctx.shadowBlur = l.shadow.blur; ctx.shadowColor = l.shadow.color; ctx.shadowOffsetX = l.shadow.x; ctx.shadowOffsetY = l.shadow.y;
    }
    try {
      drawLayer(ctx, l, res, state);
    } catch (e) {
      console.warn('Layer render failed', l.id, e);
    }
    ctx.restore();
  }
  if (state.answerBanner) drawAnswerBanner(ctx, scene.width, scene.height, state.answerBanner);
  ctx.restore();
}

function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, res: Resources, state: RenderState) {
  const { w, h } = l.transform;
  switch (l.kind) {
    case 'image': return drawImageLayer(ctx, l, res.images.get(l.id) ?? null, w, h);
    case 'text': drawRichText(ctx, l.doc, l.style, w, h); return;
    case 'emoji': {
      ctx.font = `${Math.min(h, w) * 0.86}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText(l.emoji, w / 2, h / 2 + Math.min(h, w) * 0.05);
      return;
    }
    case 'shape': return drawShape(ctx, l, w, h);
    case 'country': return drawCountry(ctx, l, res, state, w, h);
    case 'search': return drawSearch(ctx, l, state, w, h);
    case 'dialogue': return drawDialogue(ctx, l, state, w, h);
  }
}

/* ------------------------------ background ------------------------------ */
export function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, bg: Background, img: CanvasImageSource | null) {
  if (bg.type === 'gradient') {
    const a = (bg.angle * Math.PI) / 180, r = Math.hypot(W, H) / 2;
    const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
    g.addColorStop(0, bg.color); g.addColorStop(1, bg.color2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return;
  }
  ctx.fillStyle = bg.color; ctx.fillRect(0, 0, W, H);
  if (bg.type === 'image' && img) {
    const [iw, ih] = imageSize(img);
    const s = Math.max(W / iw, H / ih);
    ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  } else if (bg.type === 'pattern') {
    ctx.fillStyle = bg.color2; ctx.strokeStyle = bg.color2;
    const s = 48;
    if (bg.pattern === 'dots') for (let y = s / 2; y < H; y += s) for (let x = s / 2; x < W; x += s) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    if (bg.pattern === 'grid') { ctx.lineWidth = 2; for (let x = 0; x < W; x += s) ctx.fillRect(x, 0, 2, H); for (let y = 0; y < H; y += s) ctx.fillRect(0, y, W, 2); }
    if (bg.pattern === 'stripes') for (let x = 0; x < W; x += s * 2) ctx.fillRect(x, 0, s, H);
    if (bg.pattern === 'checker') for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) if (((x + y) / s) % 2 === 0) ctx.fillRect(x, y, s, s);
    if (bg.pattern === 'diagonal') { ctx.lineWidth = 12; ctx.beginPath(); for (let x = -H; x < W; x += s) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); } ctx.stroke(); }
  }
}

/* -------------------------------- images -------------------------------- */
function drawImageLayer(ctx: CanvasRenderingContext2D, l: ImageLayer, img: CanvasImageSource | null, w: number, h: number) {
  if (l.background && l.background !== 'transparent') {
    ctx.save(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = l.background; roundRect(ctx, 0, 0, w, h, l.border.radius); ctx.fill();
    ctx.restore();
  }
  if (!img) {
    if (!l.assetId) {
      ctx.save(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([16, 12]); ctx.lineWidth = 4;
      roundRect(ctx, 2, 2, w - 4, h - 4, 16); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `600 ${Math.max(18, Math.min(42, w / 12))}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Drop or choose an image', w / 2, h / 2);
      ctx.restore();
    }
    return;
  }
  const p = l.padding;
  const bw = Math.max(1, w - p * 2), bh = Math.max(1, h - p * 2);
  const [iw, ih] = imageSize(img);
  let dw = bw, dh = bh;
  if (l.fit === 'contain') { const s = Math.min(bw / iw, bh / ih); dw = iw * s; dh = ih * s; }
  else if (l.fit === 'cover') { const s = Math.max(bw / iw, bh / ih); dw = iw * s; dh = ih * s; }
  ctx.save();
  if (l.fit === 'cover' || l.border.radius > 0) { roundRect(ctx, p, p, bw, bh, Math.max(0, l.border.radius - p)); ctx.clip(); }
  ctx.drawImage(img, p + (bw - dw) / 2, p + (bh - dh) / 2, dw, dh);
  ctx.restore();
  if (l.border.width > 0) {
    ctx.save(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = l.border.color; ctx.lineWidth = l.border.width;
    roundRect(ctx, l.border.width / 2, l.border.width / 2, w - l.border.width, h - l.border.width, l.border.radius); ctx.stroke();
    ctx.restore();
  }
}

/* -------------------------------- shapes -------------------------------- */
function drawShape(ctx: CanvasRenderingContext2D, l: ShapeLayer, w: number, h: number) {
  ctx.fillStyle = l.fill; ctx.strokeStyle = l.stroke; ctx.lineWidth = l.strokeWidth;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const doFill = l.fill !== 'transparent', doStroke = l.strokeWidth > 0 && l.stroke !== 'transparent';
  ctx.beginPath();
  switch (l.shape) {
    case 'rect': roundRect(ctx, 0, 0, w, h, l.radius); break;
    case 'ellipse': ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.45 : 1; const x = w / 2 + Math.cos(a) * r * w / 2, y = h / 2 + Math.sin(a) * r * h / 2; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); break;
    case 'line': ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.strokeStyle = l.stroke !== 'transparent' ? l.stroke : l.fill; ctx.lineWidth = Math.max(2, l.strokeWidth || h); ctx.stroke(); return;
    case 'arrow': {
      const lw = Math.max(4, l.strokeWidth || h * 0.25);
      ctx.strokeStyle = l.stroke !== 'transparent' ? l.stroke : l.fill; ctx.lineWidth = lw;
      ctx.moveTo(0, h / 2); ctx.lineTo(w - lw * 1.5, h / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w, h / 2); ctx.lineTo(w - lw * 3, h / 2 - lw * 2); ctx.lineTo(w - lw * 3, h / 2 + lw * 2); ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle; ctx.fill(); return;
    }
    case 'path': {
      const pts = l.points ?? [];
      for (let i = 0; i + 1 < pts.length; i += 2) { const x = pts[i] * w, y = pts[i + 1] * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.strokeStyle = l.stroke !== 'transparent' ? l.stroke : l.fill; ctx.lineWidth = Math.max(1, l.strokeWidth || 6); ctx.stroke(); return;
    }
  }
  if (doFill) ctx.fill();
  if (doStroke) ctx.stroke();
}

/* ------------------------------- countries ------------------------------ */
export function makeProjection(name: CountryLayer['projection']): GeoProjection {
  switch (name) {
    case 'mercator': return geoMercator();
    case 'naturalEarth': return geoNaturalEarth1();
    case 'orthographic': return geoOrthographic();
    case 'azimuthalEqualArea': return geoAzimuthalEqualArea();
    case 'conicEqualArea': return geoConicEqualArea();
    default: return geoEqualEarth();
  }
}

function featureFor(geo: GeoData, iso3: string): CountryFeature | undefined {
  const c = getCountry(iso3);
  return c?.geometryId ? geo.byId.get(c.geometryId) : undefined;
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}700 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size / 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function drawCountry(ctx: CanvasRenderingContext2D, l: CountryLayer, res: Resources, state: RenderState, w: number, h: number) {
  const meta = getCountry(l.iso3);
  if (!meta) { placeholder(ctx, w, h, 'Choose a country'); return; }
  if (l.display === 'flag') {
    const img = res.flags.get(meta.iso2);
    if (!img) { placeholder(ctx, w, h, 'Flag unavailable'); return; }
    const [iw, ih] = l.flag.aspect === '1x1' ? [1, 1] : [4, 3];
    const s = Math.min(w / iw, h / ih), dw = iw * s, dh = ih * s;
    const x = (w - dw) / 2, y = (h - dh) / 2;
    ctx.drawImage(img, x, y, dw, dh);
    if (l.flag.border) { ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, dw - 2, dh - 2); }
    return;
  }
  const geo = res.geo;
  if (!geo) { placeholder(ctx, w, h, 'Loading map…'); return; }
  const target = featureFor(geo, meta.iso3);
  if (!target) { placeholder(ctx, w, h, `No outline data for ${state.answerRevealed ? meta.name : 'this territory'}`); return; }
  const shownTarget = filterIslands(target, l.islands);
  const projection = makeProjection(l.projection);
  const [clon, clat] = geoCentroid(largestPart(target));
  projection.rotate(l.projection === 'orthographic' || l.projection === 'azimuthalEqualArea' ? [-clon, -clat] : [-clon, 0]);
  if (l.projection === 'conicEqualArea') (projection as unknown as { parallels: (p: [number, number]) => void }).parallels([clat - 10, clat + 10]);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  // rotate the map around the box centre
  ctx.translate(w / 2, h / 2); ctx.rotate((l.mapRotation * Math.PI) / 180); ctx.translate(-w / 2, -h / 2);
  const pad = Math.min(w, h) * 0.06;

  if (l.display === 'outline') {
    projection.fitExtent([[pad, pad], [w - pad, h - pad]], shownTarget);
    applyZoomPan(projection, l, w, h);
    const path = geoPath(projection, ctx);
    ctx.beginPath(); path(shownTarget);
    if (l.filled) { ctx.fillStyle = l.fill; ctx.fill(); }
    if (l.strokeWidth > 0) { ctx.shadowColor = 'transparent'; ctx.lineJoin = 'round'; ctx.strokeStyle = l.stroke; ctx.lineWidth = l.strokeWidth; ctx.stroke(); }
    ctx.restore();
    return;
  }

  // neighbours map
  const n = l.neighbors;
  const neighborMetas = getLandNeighbors(meta.iso3).slice(0, n.maxNeighbors);
  const neighborFeatures = neighborMetas.map((m) => ({ m, f: featureFor(geo, m.iso3) })).filter((x): x is { m: typeof x.m; f: CountryFeature } => !!x.f);
  const isIsland = neighborMetas.length === 0;
  const nearby = isIsland && n.showNearbyForIslands ? nearbyCountries(meta.iso3, 4).map((m) => ({ m, f: featureFor(geo, m.iso3) })).filter((x): x is { m: typeof x.m; f: CountryFeature } => !!x.f) : [];
  const fitSet = { type: 'FeatureCollection' as const, features: [shownTarget, ...neighborFeatures.map((x) => filterIslands(x.f, 'near'))] };
  projection.fitExtent([[pad, pad], [w - pad, h - pad]], fitSet);
  if (isIsland) projection.scale(projection.scale() / 2.6); // zoom out to show surrounding region
  applyZoomPan(projection, l, w, h);
  const path = geoPath(projection, ctx);
  ctx.fillStyle = n.sea; ctx.fillRect(0, 0, w, h);
  ctx.lineJoin = 'round'; ctx.shadowColor = 'transparent';
  const neighborIds = new Set(neighborFeatures.map((x) => x.f));
  if (n.showOthers) {
    for (const f of geo.all) {
      if (f === target || neighborIds.has(f)) continue;
      ctx.beginPath(); path(f); ctx.fillStyle = n.otherFill; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  for (const { f } of neighborFeatures) {
    ctx.beginPath(); path(f); ctx.fillStyle = n.highlightNeighbors ? n.neighborFill : n.otherFill; ctx.fill();
    ctx.strokeStyle = l.stroke; ctx.lineWidth = Math.max(1, l.strokeWidth * 0.6); ctx.stroke();
  }
  ctx.beginPath(); path(target);
  ctx.fillStyle = state.answerRevealed ? l.stroke : n.targetFill; ctx.fill();
  ctx.setLineDash(state.answerRevealed ? [] : [10, 8]); ctx.strokeStyle = state.answerRevealed ? '#ffffff' : l.stroke; ctx.lineWidth = Math.max(2, l.strokeWidth); ctx.stroke(); ctx.setLineDash([]);
  const labelSize = Math.max(14, Math.min(w, h) / 30);
  if (n.showLabels) {
    for (const { m, f } of neighborFeatures) {
      const p = projection(geoCentroid(largestPart(f)));
      if (p && p[0] > 0 && p[1] > 0 && p[0] < w && p[1] < h) drawLabel(ctx, m.name, p[0], p[1], labelSize, n.labelColor);
    }
    for (const { m, f } of nearby) {
      const p = projection(geoCentroid(largestPart(f)));
      if (p && p[0] > 0 && p[1] > 0 && p[0] < w && p[1] < h) drawLabel(ctx, `${m.name} (nearby)`, p[0], p[1], labelSize * 0.85, n.labelColor, true);
    }
  }
  const tp = projection(geoCentroid(largestPart(target)));
  if (tp) drawLabel(ctx, state.answerRevealed && n.revealTargetName ? meta.name : '?', tp[0], tp[1], labelSize * (state.answerRevealed ? 1.3 : 2), '#ffffff');
  if (isIsland) drawLabel(ctx, 'No land borders', w / 2, h - labelSize * 1.2, labelSize * 0.9, '#fbbf24', true);
  ctx.restore();
}

function applyZoomPan(p: GeoProjection, l: CountryLayer, w: number, h: number) {
  if (l.zoom !== 1) {
    const [tx, ty] = p.translate();
    const k = l.zoom;
    p.scale(p.scale() * k);
    p.translate([w / 2 + (tx - w / 2) * k, h / 2 + (ty - h / 2) * k]);
  }
  if (l.panX || l.panY) { const [tx, ty] = p.translate(); p.translate([tx + l.panX * w, ty + l.panY * h]); }
}

function placeholder(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  ctx.save(); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.setLineDash([14, 10]); ctx.lineWidth = 3;
  roundRect(ctx, 2, 2, w - 4, h - 4, 12); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `600 ${Math.max(16, Math.min(40, w / 14))}px Inter, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2);
  ctx.restore();
}

/* ---------------------------- search history ---------------------------- */
const SEARCH_THEMES = {
  light: { card: '#ffffff', header: '#f1f5f9', text: '#0f172a', muted: '#64748b', accent: '#2563eb', row: '#f8fafc', border: '#e2e8f0', font: 'Inter, Arial, sans-serif' },
  dark: { card: '#1e1f22', header: '#2b2d31', text: '#f1f5f9', muted: '#94a3b8', accent: '#8ab4f8', row: '#26282c', border: '#3f4147', font: 'Inter, Arial, sans-serif' },
  retro: { card: '#c0c0c0', header: '#000080', text: '#000000', muted: '#404040', accent: '#ffffff', row: '#d4d0c8', border: '#808080', font: 'Tahoma, Verdana, sans-serif' },
  mobile: { card: '#ffffff', header: '#ffffff', text: '#111827', muted: '#6b7280', accent: '#10b981', row: '#ffffff', border: '#f3f4f6', font: 'system-ui, sans-serif' },
};

function drawSearch(ctx: CanvasRenderingContext2D, l: SearchLayer, state: RenderState, w: number, h: number) {
  const th = SEARCH_THEMES[l.theme];
  const r = l.theme === 'retro' ? 0 : l.theme === 'mobile' ? 36 : 20;
  ctx.fillStyle = th.card; roundRect(ctx, 0, 0, w, h, r); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save(); roundRect(ctx, 0, 0, w, h, r); ctx.clip();
  const headerH = Math.min(110, h * 0.14);
  ctx.fillStyle = th.header; ctx.fillRect(0, 0, w, headerH);
  ctx.fillStyle = l.theme === 'retro' ? '#ffffff' : th.accent;
  ctx.font = `700 ${headerH * 0.36}px ${th.font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(l.engineName, headerH * 0.4, headerH / 2);
  const en = ctx.measureText(l.engineName).width;
  ctx.fillStyle = l.theme === 'retro' ? '#ffffff' : th.muted; ctx.font = `500 ${headerH * 0.28}px ${th.font}`;
  ctx.fillText(l.title, headerH * 0.4 + en + headerH * 0.4, headerH / 2);
  ctx.fillStyle = th.border; ctx.fillRect(0, headerH, w, 2);
  const visible = l.entries.filter((e) => e.revealStep <= state.revealStep || state.ghostHidden);
  const sugH = l.showSuggestions && l.suggestions.length ? headerH * 0.9 : 0;
  const avail = h - headerH - sugH - 20;
  const rowH = Math.min(headerH * 0.95, avail / Math.max(5, l.entries.length));
  let y = headerH + 10;
  for (const e of l.entries) {
    const shown = e.revealStep <= state.revealStep;
    if (!shown && !state.ghostHidden) { y += rowH; continue; }
    ctx.globalAlpha = shown ? 1 : 0.3;
    ctx.fillStyle = th.row; ctx.fillRect(12, y + 3, w - 24, rowH - 6);
    const cx = 12 + rowH * 0.5, cy = y + rowH / 2, ir = rowH * 0.2;
    // clock / history glyph
    ctx.strokeStyle = th.muted; ctx.lineWidth = Math.max(2, rowH * 0.05);
    ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - ir * 0.6); ctx.lineTo(cx, cy); ctx.lineTo(cx + ir * 0.5, cy + ir * 0.3); ctx.stroke();
    const fs = rowH * 0.36;
    ctx.fillStyle = th.text; ctx.font = `500 ${fs}px ${th.font}`; ctx.textAlign = 'left';
    const meta = l.showDates ? `${e.date}${e.date && e.time ? ' · ' : ''}${e.time}` : '';
    ctx.font = `400 ${fs * 0.8}px ${th.font}`;
    const mw = meta ? ctx.measureText(meta).width + 30 : 0;
    ctx.font = `500 ${fs}px ${th.font}`;
    let txt = e.text;
    const maxTW = w - 24 - rowH - mw - 20;
    while (txt.length > 1 && ctx.measureText(txt).width > maxTW) txt = txt.slice(0, -2) + '…';
    ctx.fillText(txt, 12 + rowH, cy);
    if (meta) { ctx.fillStyle = th.muted; ctx.font = `400 ${fs * 0.8}px ${th.font}`; ctx.textAlign = 'right'; ctx.fillText(meta, w - 30, cy); }
    ctx.globalAlpha = 1;
    y += rowH;
  }
  void visible;
  if (sugH) {
    let x = 20; const cy = h - sugH / 2 - 6;
    ctx.font = `500 ${sugH * 0.3}px ${th.font}`; ctx.textAlign = 'left';
    ctx.fillStyle = th.muted; ctx.fillText('Related:', x, cy); x += ctx.measureText('Related:').width + 16;
    for (const s of l.suggestions) {
      const tw = ctx.measureText(s).width + 32;
      if (x + tw > w - 20) break;
      ctx.fillStyle = th.row; roundRect(ctx, x, cy - sugH * 0.3, tw, sugH * 0.6, sugH * 0.3); ctx.fill();
      ctx.strokeStyle = th.border; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = th.accent; ctx.fillText(s, x + 16, cy);
      x += tw + 12;
    }
  }
  ctx.restore();
  ctx.strokeStyle = th.border; ctx.lineWidth = 3; roundRect(ctx, 0, 0, w, h, r); ctx.stroke();
}

/* ------------------------------- dialogue ------------------------------- */
function drawDialogue(ctx: CanvasRenderingContext2D, l: DialogueLayer, state: RenderState, w: number, h: number) {
  const lines = l.lines.filter((ln) => ln.revealStep <= state.revealStep || state.ghostHidden);
  if (!lines.length) { if (!l.lines.length) placeholder(ctx, w, h, 'Add dialogue lines'); return; }
  let fs = l.fontSize;
  const layoutAll = (size: number) => {
    ctx.font = `${l.style === 'script' ? '' : 'italic '}400 ${size}px ${l.fontFamily}`;
    const pad = l.style === 'bubble' ? size * 1.2 : size * 0.4;
    const maxW = l.style === 'bubble' ? w * 0.72 - pad * 2 : w - size * 1.6;
    return lines.map((ln) => ({ ln, wrapped: wrapLines(ctx, l.style === 'quote' ? `“${ln.text}”` : ln.text, maxW) }));
  };
  const measureH = (size: number) => layoutAll(size).reduce((acc, x) => acc + x.wrapped.length * size * 1.3 + (l.showSpeakers && x.ln.speaker ? size * 0.9 : 0) + size * (l.style === 'bubble' ? 1.6 : 0.8), 0);
  while (fs > 12 && measureH(fs) > h) fs -= 2;
  const laid = layoutAll(fs);
  let y = Math.max(0, (h - measureH(fs)) / 2);
  if (l.style === 'subtitle') y = Math.max(0, h - measureH(fs));
  ctx.textBaseline = 'top';
  laid.forEach(({ ln, wrapped }, idx) => {
    ctx.globalAlpha = ln.revealStep <= state.revealStep ? 1 : 0.3;
    const lh = fs * 1.3;
    if (l.style === 'bubble') {
      const left = idx % 2 === 0;
      ctx.font = `400 ${fs}px ${l.fontFamily}`;
      const tw = Math.max(...wrapped.map((s) => ctx.measureText(s).width));
      const bw = tw + fs * 1.6, bh = wrapped.length * lh + fs * 0.8 + (l.showSpeakers && ln.speaker ? fs * 0.9 : 0);
      const bx = left ? 10 : w - bw - 10;
      ctx.fillStyle = left ? '#ffffff' : l.accent; roundRect(ctx, bx, y, bw, bh, fs * 0.8); ctx.fill();
      let ty = y + fs * 0.4;
      if (l.showSpeakers && ln.speaker) { ctx.fillStyle = left ? l.accent : '#111827'; ctx.font = `700 ${fs * 0.6}px Inter, sans-serif`; ctx.textAlign = 'left'; ctx.fillText(ln.speaker.toUpperCase(), bx + fs * 0.8, ty); ty += fs * 0.9; }
      ctx.fillStyle = '#111827'; ctx.font = `400 ${fs}px ${l.fontFamily}`; ctx.textAlign = 'left';
      for (const s of wrapped) { ctx.fillText(s, bx + fs * 0.8, ty); ty += lh; }
      y += bh + fs * 0.8;
      return;
    }
    ctx.textAlign = 'center';
    if (l.showSpeakers && ln.speaker) {
      ctx.fillStyle = l.accent; ctx.font = `700 ${fs * 0.6}px Inter, sans-serif`;
      ctx.fillText(l.style === 'script' ? ln.speaker.toUpperCase() : `— ${ln.speaker}`, w / 2, y); y += fs * 0.9;
    }
    ctx.font = `${l.style === 'script' ? '' : 'italic '}400 ${fs}px ${l.fontFamily}`;
    for (const s of wrapped) {
      if (l.style === 'subtitle') { ctx.lineWidth = fs / 6; ctx.strokeStyle = '#000'; ctx.strokeText(s, w / 2, y); ctx.fillStyle = '#fde047'; }
      else ctx.fillStyle = l.color;
      ctx.fillText(s, w / 2, y); y += lh;
    }
    y += fs * 0.8;
  });
  ctx.globalAlpha = 1;
}

/* ----------------------------- answer banner ---------------------------- */
export function drawAnswerBanner(ctx: CanvasRenderingContext2D, W: number, H: number, text: string) {
  const bh = H * 0.13;
  ctx.save();
  ctx.fillStyle = 'rgba(16,185,129,0.95)';
  roundRect(ctx, W * 0.1, H - bh - H * 0.05, W * 0.8, bh, bh * 0.25); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let fs = bh * 0.45;
  ctx.font = `700 ${fs}px Inter, sans-serif`;
  while (ctx.measureText(text).width > W * 0.75 && fs > 12) { fs -= 2; ctx.font = `700 ${fs}px Inter, sans-serif`; }
  ctx.fillText(text, W / 2, H - bh / 2 - H * 0.05);
  ctx.restore();
}

/** Renders a scene to a new canvas at the requested output width. */
export async function renderSceneToCanvas(scene: Scene, state: RenderState, outWidth = scene.width): Promise<HTMLCanvasElement> {
  const res = await prepareScene(scene, state);
  const c = document.createElement('canvas');
  const k = outWidth / scene.width;
  c.width = Math.round(scene.width * k); c.height = Math.round(scene.height * k);
  const ctx = c.getContext('2d')!;
  ctx.scale(k, k);
  drawScene(ctx, scene, res, state);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), type, quality));
}

export { countryByGeometryId };

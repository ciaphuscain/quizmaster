import type { RichNode, TextStyle } from '@/types/schema';

type Run = { text: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; color?: string };
type Para = { runs: Run[]; bullet: string | null; indent: number; heading: number };
export type LaidLine = { runs: (Run & { x: number; width: number })[]; width: number; bullet: string | null; indent: number; scale: number };

/** Flattens a Tiptap/ProseMirror JSON document to paragraphs of styled runs. */
export function docToParagraphs(doc: RichNode): Para[] {
  const paras: Para[] = [];
  const walk = (n: RichNode, list: { ordered: boolean; index: number } | null, depth: number) => {
    if (n.type === 'paragraph' || n.type === 'heading') {
      const runs: Run[] = [];
      const collect = (c: RichNode) => {
        if (c.type === 'text') {
          const m = new Set((c.marks ?? []).map((x) => x.type));
          const color = c.marks?.find((x) => x.type === 'textStyle')?.attrs?.color as string | undefined;
          runs.push({ text: c.text ?? '', bold: m.has('bold'), italic: m.has('italic'), underline: m.has('underline'), strike: m.has('strike'), color });
        } else if (c.type === 'hardBreak') runs.push({ text: '\n', bold: false, italic: false, underline: false, strike: false });
        else c.content?.forEach(collect);
      };
      n.content?.forEach(collect);
      let bullet: string | null = null;
      if (list) bullet = list.ordered ? `${list.index}.` : '•';
      paras.push({ runs, bullet, indent: depth, heading: n.type === 'heading' ? Number(n.attrs?.level ?? 1) : 0 });
      return;
    }
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      let i = Number(n.attrs?.start ?? 1);
      for (const item of n.content ?? []) {
        let first = true;
        for (const c of item.content ?? []) {
          walk(c, first ? { ordered: n.type === 'orderedList', index: i } : null, depth + 1);
          first = false;
        }
        i++;
      }
      return;
    }
    n.content?.forEach((c) => walk(c, list, depth));
  };
  walk(doc, null, 0);
  return paras;
}

export function fontString(style: TextStyle, run: Partial<Run>, size: number) {
  const italic = style.italic || run.italic ? 'italic ' : '';
  const bold = style.bold || run.bold ? '700 ' : '400 ';
  return `${italic}${bold}${size}px ${style.fontFamily}`;
}

function layout(ctx: CanvasRenderingContext2D, paras: Para[], style: TextStyle, size: number, maxW: number): LaidLine[] {
  const lines: LaidLine[] = [];
  const ls = style.letterSpacing;
  const measure = (t: string, r: Partial<Run>, s: number) => {
    ctx.font = fontString(style, r, s);
    return ctx.measureText(t).width + ls * t.length;
  };
  for (const p of paras) {
    const scale = p.heading ? [1, 1.6, 1.35, 1.15][Math.min(3, p.heading)] : 1;
    const s = size * scale;
    const indentPx = p.indent > 0 ? s * 1.2 * p.indent : 0;
    const avail = Math.max(10, maxW - indentPx);
    let cur: LaidLine = { runs: [], width: 0, bullet: p.bullet, indent: indentPx, scale };
    const push = () => { lines.push(cur); cur = { runs: [], width: 0, bullet: null, indent: indentPx, scale }; };
    if (p.runs.length === 0) { push(); continue; }
    for (const run of p.runs) {
      if (run.text === '\n') { push(); continue; }
      const tokens = run.text.split(/(\s+)/).filter((t) => t.length);
      for (const tok of tokens) {
        let w = measure(tok, run, s);
        if (cur.width + w > avail && cur.runs.length && !/^\s+$/.test(tok)) push();
        if (/^\s+$/.test(tok) && cur.runs.length === 0) continue;
        if (w > avail) {
          // break very long words by characters
          let chunk = '';
          for (const ch of tok) {
            const cw = measure(chunk + ch, run, s);
            if (cw > avail && chunk) { cur.runs.push({ ...run, text: chunk, x: cur.width, width: measure(chunk, run, s) }); cur.width += measure(chunk, run, s); push(); chunk = ch; }
            else chunk += ch;
          }
          w = measure(chunk, run, s);
          cur.runs.push({ ...run, text: chunk, x: cur.width, width: w }); cur.width += w;
          continue;
        }
        const last = cur.runs[cur.runs.length - 1];
        if (last && last.bold === run.bold && last.italic === run.italic && last.underline === run.underline && last.strike === run.strike && last.color === run.color) {
          last.text += tok; last.width += w;
        } else cur.runs.push({ ...run, text: tok, x: cur.width, width: w });
        cur.width += w;
      }
    }
    push();
  }
  // trim trailing whitespace widths
  for (const l of lines) {
    const last = l.runs[l.runs.length - 1];
    if (last && /\s+$/.test(last.text)) {
      const trimmed = last.text.replace(/\s+$/, '');
      const nw = trimmed ? measure(trimmed, last, size * l.scale) : 0;
      l.width -= last.width - nw; last.width = nw; last.text = trimmed;
    }
  }
  return lines;
}

/** Draws rich text into a box with alignment, wrapping, and overflow handling. Returns true if it overflowed. */
export function drawRichText(ctx: CanvasRenderingContext2D, doc: RichNode, style: TextStyle, w: number, h: number): boolean {
  const pad = style.padding;
  const innerW = Math.max(10, w - pad * 2), innerH = Math.max(10, h - pad * 2);
  const paras = docToParagraphs(doc);
  let size = style.fontSize;
  let lines = layout(ctx, paras, style, size, innerW);
  const totalH = (ls: LaidLine[], s: number) => ls.reduce((acc, l) => acc + s * l.scale * style.lineHeight, 0);
  let overflow = totalH(lines, size) > innerH;
  if (overflow && style.overflow === 'shrink') {
    let lo = 6, hi = size;
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      if (totalH(layout(ctx, paras, style, mid, innerW), mid) > innerH) hi = mid; else lo = mid;
    }
    size = lo; lines = layout(ctx, paras, style, size, innerW); overflow = false;
  }
  if (style.background && style.background !== 'transparent') {
    ctx.fillStyle = style.background;
    roundRect(ctx, 0, 0, w, h, style.radius); ctx.fill();
  }
  ctx.save();
  if (style.overflow !== 'visible') { ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); }
  const th = totalH(lines, size);
  let y = pad + (style.vAlign === 'middle' ? (innerH - th) / 2 : style.vAlign === 'bottom' ? innerH - th : 0);
  ctx.textBaseline = 'alphabetic';
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${style.letterSpacing}px`; } catch { /* unsupported */ }
  for (const l of lines) {
    const s = size * l.scale;
    const lh = s * style.lineHeight;
    const base = y + lh / 2 + s * 0.35;
    const availW = innerW - l.indent;
    const x0 = pad + l.indent + (style.align === 'center' ? (availW - l.width) / 2 : style.align === 'right' ? availW - l.width : 0);
    if (l.bullet) {
      ctx.font = fontString(style, {}, s); ctx.fillStyle = style.color; ctx.textAlign = 'right';
      ctx.fillText(l.bullet, x0 - s * 0.35, base);
    }
    ctx.textAlign = 'left';
    for (const r of l.runs) {
      ctx.font = fontString(style, r, s);
      ctx.fillStyle = r.color ?? style.color;
      ctx.fillText(r.text, x0 + r.x, base);
      if (style.underline || r.underline || r.strike) {
        ctx.fillRect(x0 + r.x, r.strike ? base - s * 0.3 : base + s * 0.1, r.width, Math.max(1, s / 16));
      }
    }
    y += lh;
  }
  ctx.restore();
  return overflow;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Simple wrapped plain text helper. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

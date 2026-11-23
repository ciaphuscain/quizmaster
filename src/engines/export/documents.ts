import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { AnswerReveal, Question } from '@/types/schema';
import { renderSceneToCanvas, canvasToBlob } from '@/engines/rendering/renderScene';
import { clipToWavBlob } from '@/engines/audio/clip';
import { blobToArrayBuffer } from '@/utils/hash';
import { GAMES } from '@/games/registry';

export type ExportItem = { question: Question; number: number; roundTitle?: string };

/** pdf-lib standard fonts only support WinAnsi; replace unsupported characters (e.g. emoji) safely. */
function safe(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text) { try { font.encodeText(ch); out += ch; } catch { out += '?'; } }
  return out;
}
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of safe(text, font).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}

async function slideJpeg(q: Question, answer: boolean, width = 1280): Promise<ArrayBuffer> {
  const c = await renderSceneToCanvas(q.scene, { revealStep: answer ? Infinity : Infinity, answerRevealed: answer, answerBanner: answer ? q.correctAnswer : null }, width);
  return blobToArrayBuffer(await canvasToBlob(c, 'image/jpeg', 0.85));
}

/** Printable question sheet: one rendered slide + prompt per half page. */
export async function exportQuestionSheetPdf(title: string, items: ExportItem[], onProgress?: (m: string) => void): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 40;
  let page = pdf.addPage([W, H]); let y = H - M;
  page.drawText(safe(title, bold), { x: M, y: y - 18, size: 20, font: bold }); y -= 44;
  for (const [i, it] of items.entries()) {
    onProgress?.(`Rendering question ${i + 1}/${items.length}`);
    const img = await pdf.embedJpg(await slideJpeg(it.question, false));
    const iw = W - M * 2, ih = (iw * img.height) / img.width;
    if (y - ih - 50 < M) { page = pdf.addPage([W, H]); y = H - M; }
    const head = `${it.number}. ${it.roundTitle ? `[${it.roundTitle}] ` : ''}${it.question.prompt}`;
    for (const l of wrap(head, bold, 12, iw)) { page.drawText(l, { x: M, y: y - 12, size: 12, font: bold }); y -= 16; }
    page.drawImage(img, { x: M, y: y - ih - 4, width: iw, height: ih }); y -= ih + 10;
    const meta = `${GAMES[it.question.gameType].name} · ${it.question.points} pts${it.question.timeLimit ? ` · ${it.question.timeLimit}s` : ''}${it.question.audio ? ' · audio clue (play during quiz)' : ''}`;
    page.drawText(safe(meta, font), { x: M, y: y - 10, size: 9, font, color: rgb(0.4, 0.4, 0.4) }); y -= 18;
    page.drawText('Answer: ______________________________', { x: M, y: y - 12, size: 11, font }); y -= 30;
  }
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' });
}

/** Answer key: text list with answers, alternatives and hints. */
export async function exportAnswerKeyPdf(title: string, items: ExportItem[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48;
  let page = pdf.addPage([W, H]); let y = H - M;
  const line = (text: string, f: PDFFont, size: number, color = rgb(0, 0, 0), indent = 0) => {
    for (const l of wrap(text, f, size, W - M * 2 - indent)) {
      if (y < M + size) { page = pdf.addPage([W, H]); y = H - M; }
      page.drawText(l, { x: M + indent, y: y - size, size, font: f, color }); y -= size + 4;
    }
  };
  line(`${title} — Answer key`, bold, 18); y -= 8;
  let lastRound = '';
  for (const it of items) {
    if (it.roundTitle && it.roundTitle !== lastRound) { y -= 6; line(it.roundTitle, bold, 14, rgb(0.7, 0.4, 0)); lastRound = it.roundTitle; }
    line(`${it.number}. ${it.question.correctAnswer || '(no answer set)'}`, bold, 12);
    line(`${GAMES[it.question.gameType].short} · ${it.question.prompt} · ${it.question.points} pts`, font, 9, rgb(0.4, 0.4, 0.4), 14);
    if (it.question.acceptedAnswers.length) line(`Also accept: ${it.question.acceptedAnswers.join(', ')}`, font, 10, rgb(0.2, 0.2, 0.2), 14);
    if (it.question.hints.length) line(`Hints: ${it.question.hints.map((h) => h.text).join(' | ')}`, font, 9, rgb(0.35, 0.35, 0.35), 14);
    y -= 4;
  }
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' });
}

/**
 * PowerPoint export. Each question becomes a question slide and an answer slide using the fully rendered
 * scene image (pixel-accurate layout). Audio clues are embedded as WAV media where present.
 * Answer slides follow the quiz's answer-reveal setting (after each question, end of each round, or end of quiz).
 * Limitations (documented): progressive reveal steps, timers and live effects are not interactive in PPTX;
 * the question slide shows all reveal steps.
 */
export async function exportPptx(title: string, items: ExportItem[], onProgress?: (m: string) => void, answerReveal: AnswerReveal = 'each'): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.title = title;
  const W = 13.333, H = 7.5;
  const toDataUrl = async (b: Blob) => `data:${b.type};base64,${btoa(Array.from(new Uint8Array(await blobToArrayBuffer(b)), (c) => String.fromCharCode(c)).join(''))}`;
  const heading = (text: string, color = 'FFFFFF') => {
    const r = pptx.addSlide(); r.background = { color: '0F172A' };
    r.addText(text, { x: 0.5, y: 3, w: W - 1, h: 1.2, fontSize: 40, bold: true, color, align: 'center' });
  };
  const t = pptx.addSlide(); t.background = { color: '0F172A' };
  t.addText(title, { x: 0.5, y: 3, w: W - 1, h: 1.2, fontSize: 44, bold: true, color: 'F59E0B', align: 'center' });

  const questionSlide = async (it: ExportItem) => {
    const q = it.question;
    const k = Math.min(W / q.scene.width, H / q.scene.height), iw = q.scene.width * k, ih = q.scene.height * k;
    const img = await renderSceneToCanvas(q.scene, { revealStep: Infinity, answerRevealed: false }, 1920);
    const s1 = pptx.addSlide(); s1.background = { color: '000000' };
    s1.addImage({ data: await toDataUrl(await canvasToBlob(img, 'image/png')), x: (W - iw) / 2, y: (H - ih) / 2, w: iw, h: ih });
    s1.addText(`${it.number}`, { x: 0.15, y: 0.1, w: 0.8, h: 0.4, fontSize: 14, color: 'FFFFFF', bold: true });
    if (q.audio) {
      try { s1.addMedia({ type: 'audio', data: await toDataUrl(await clipToWavBlob(q.audio)), x: W - 1.1, y: H - 1.1, w: 0.9, h: 0.9 }); }
      catch { s1.addText('Audio clue unavailable', { x: W - 3, y: H - 0.6, w: 2.8, h: 0.4, fontSize: 10, color: 'FFFFFF' }); }
    }
    s1.addNotes(`Answer: ${q.correctAnswer}${q.acceptedAnswers.length ? `\nAlso accept: ${q.acceptedAnswers.join(', ')}` : ''}${q.hints.length ? `\nHints: ${q.hints.map((h) => h.text).join(' | ')}` : ''}${q.notes ? `\n${q.notes}` : ''}`);
  };
  const answerSlide = async (it: ExportItem) => {
    const q = it.question;
    const k = Math.min(W / q.scene.width, H / q.scene.height), iw = q.scene.width * k, ih = q.scene.height * k;
    const img = await renderSceneToCanvas(q.scene, { revealStep: Infinity, answerRevealed: true }, 1920);
    const s2 = pptx.addSlide(); s2.background = { color: '000000' };
    s2.addImage({ data: await toDataUrl(await canvasToBlob(img, 'image/png')), x: (W - iw) / 2, y: (H - ih) / 2, w: iw, h: ih });
    s2.addText(`${it.number}`, { x: 0.15, y: 0.1, w: 0.8, h: 0.4, fontSize: 14, color: '34D399', bold: true });
    s2.addText(q.correctAnswer || '—', { x: 1.5, y: H - 1.25, w: W - 3, h: 0.9, fontSize: 32, bold: true, color: 'FFFFFF', align: 'center', fill: { color: '059669' } });
  };

  // group items by round (preserving order)
  const groups: { round: string; items: ExportItem[] }[] = [];
  for (const it of items) {
    const key = it.roundTitle ?? '';
    if (!groups.length || groups[groups.length - 1].round !== key) groups.push({ round: key, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  let done = 0;
  const progress = () => onProgress?.(`Building slides ${++done}/${items.length * 2}`);
  for (const g of groups) {
    if (g.round) heading(g.round);
    for (const it of g.items) {
      await questionSlide(it); progress();
      if (answerReveal === 'each') { await answerSlide(it); progress(); }
    }
    if (answerReveal === 'round') {
      heading(`${g.round || 'Round'} — Answers`, '34D399');
      for (const it of g.items) { await answerSlide(it); progress(); }
    }
  }
  if (answerReveal === 'quiz') {
    heading('Answers', '34D399');
    for (const g of groups) {
      if (g.round) heading(`${g.round} — Answers`, '34D399');
      for (const it of g.items) { await answerSlide(it); progress(); }
    }
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

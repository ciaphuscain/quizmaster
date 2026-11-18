import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Upload, FileArchive, FileJson, FileText, Presentation, HardDrive, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/app/AppLayout';
import { Button, Select } from '@/components/ui/primitives';
import { Dialog, toast, errorMessage } from '@/components/ui/overlays';
import { buildPackage, exportQuestionsJson, importPackage, importQuestionsJson, parsePackage, PackageError, type ParsedPackage } from '@/engines/export/package';
import { exportAnswerKeyPdf, exportPptx, exportQuestionSheetPdf, type ExportItem } from '@/engines/export/documents';
import { downloadBlob, pickFiles, safeFilename } from '@/features/questions/actions';
import { quizzesRepo } from '@/db/repositories/other';
import { useSettings } from '@/stores/settings';
import { formatBytes } from '@/utils/misc';
import type { Question } from '@/types/schema';

async function itemsForScope(scope: string): Promise<{ title: string; items: ExportItem[] }> {
  if (scope.startsWith('quiz:')) {
    const t = await quizzesRepo.tree(scope.slice(5));
    if (!t) throw new Error('Quiz not found');
    const qs = new Map((await db.questions.bulkGet(t.rounds.flatMap((r) => r.refs.map((x) => x.questionId)))).filter((q): q is Question => !!q).map((q) => [q.id, q]));
    let n = 0;
    const items = t.rounds.flatMap((r) => r.refs.map((ref) => qs.get(ref.questionId)).filter((q): q is Question => !!q).map((q) => ({ question: q, number: ++n, roundTitle: r.title })));
    return { title: t.quiz.title, items };
  }
  const qs = await db.questions.where('status').notEqual('archived').toArray();
  return { title: 'Question bank', items: qs.map((q, i) => ({ question: q, number: i + 1 })) };
}

export default function ImportExport() {
  const quizzes = useLiveQuery(() => db.quizzes.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const counts = useLiveQuery(async () => ({ q: await db.questions.count(), a: await db.assets.count() }), []);
  const [scope, setScope] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedPackage | null>(null);
  const [importErr, setImportErr] = useState<{ message: string; details: string[] } | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);
  const update = useSettings((s) => s.update);
  const lastBackup = useSettings((s) => s.settings.lastBackupAt);
  const scopeQuiz = quizzes.find((q) => `quiz:${q.id}` === scope);
  const fileBase = safeFilename(scopeQuiz?.title ?? 'quizmaster');

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast.error(`${label} failed`, errorMessage(e)); } finally { setBusy(null); }
  };
  const doZip = () => run('ZIP export', async () => {
    const blob = scope.startsWith('quiz:') ? await buildPackage({ kind: 'quiz', quizIds: [scope.slice(5)] }, setBusy) : await buildPackage({ kind: 'questions', questionIds: await db.questions.toCollection().primaryKeys() }, setBusy);
    downloadBlob(blob, `${fileBase}.quizmaster.zip`); toast.success('Package exported', formatBytes(blob.size));
  });
  const doBackup = () => run('Backup', async () => {
    const blob = await buildPackage({ kind: 'backup' }, setBusy);
    downloadBlob(blob, `quizmaster-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    update({ lastBackupAt: Date.now() }); toast.success('Full backup downloaded', formatBytes(blob.size));
  });
  const doJson = () => run('JSON export', async () => {
    const { items } = await itemsForScope(scope);
    downloadBlob(await exportQuestionsJson(items.map((i) => i.question.id)), `${fileBase}.questions.json`);
  });
  const doPdf = (key: boolean) => run(key ? 'Answer key' : 'Question sheet', async () => {
    const { title, items } = await itemsForScope(scope);
    if (!items.length) throw new Error('No questions in scope');
    downloadBlob(key ? await exportAnswerKeyPdf(title, items) : await exportQuestionSheetPdf(title, items, setBusy), `${fileBase}-${key ? 'answer-key' : 'questions'}.pdf`);
  });
  const doPptx = () => run('PowerPoint export', async () => {
    const { title, items } = await itemsForScope(scope);
    if (!items.length) throw new Error('No questions in scope');
    downloadBlob(await exportPptx(title, items, setBusy), `${fileBase}.pptx`);
  });
  const doImport = async () => {
    const [f] = await pickFiles('.zip,.json,application/zip,application/json');
    if (!f) return;
    setImportErr(null);
    await run('Import', async () => {
      if (f.name.endsWith('.json')) { const n = await importQuestionsJson(await f.text()); toast.success(`Imported ${n} question(s) from JSON`); return; }
      try { setPreview(await parsePackage(f)); }
      catch (e) { if (e instanceof PackageError) setImportErr({ message: e.message, details: e.details }); else throw e; }
    });
  };
  const confirmImport = () => run('Import', async () => {
    if (!preview) return;
    const r = await importPackage(preview);
    setPreview(null);
    toast.success(`Imported ${r.questions} questions, ${r.quizzes} quizzes`, `${r.assetsAdded} new media files, ${r.assetsReused} reused (deduplicated)${r.warnings.length ? `\n${r.warnings.length} warning(s)` : ''}`);
  });
  const checkStorage = async () => {
    if (!navigator.storage?.estimate) { setEstimate('Storage estimate not supported by this browser.'); return; }
    const e = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted?.();
    setEstimate(`Using ${formatBytes(e.usage ?? 0)} of ~${formatBytes(e.quota ?? 0)} available.${persisted ? ' Storage is persistent.' : ' Storage is "best effort" — request persistence to protect against eviction.'}`);
  };

  const Card = ({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      <p className="text-xs text-muted">{desc}</p>
      <div className="mt-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Import / Export" subtitle={`${counts?.q ?? 0} questions · ${counts?.a ?? 0} media assets · last backup: ${lastBackup ? new Date(lastBackup).toLocaleString() : 'never'}`} />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          {busy && <div className="flex items-center gap-2 rounded border border-line bg-panel-2 px-3 py-2 text-xs"><Loader2 size={14} className="animate-spin" />{busy}</div>}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Export scope</span>
            <Select className="w-80" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Export scope" data-testid="export-scope">
              <option value="all">Whole question bank (excluding archived)</option>
              {quizzes.map((q) => <option key={q.id} value={`quiz:${q.id}`}>Quiz: {q.title}</option>)}
            </Select>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card icon={<FileArchive size={16} />} title="Portable ZIP package" desc="Questions, answers, layouts, effects, quiz rounds, templates and original media with SHA-256 hashes. Re-importable on any machine.">
              <Button variant="primary" disabled={!!busy} onClick={doZip} data-testid="export-zip"><Download size={14} />Export ZIP</Button>
            </Card>
            <Card icon={<FileJson size={16} />} title="JSON (data only)" desc="Validated question data without media bytes — handy for scripts and version control.">
              <Button disabled={!!busy} onClick={doJson}><Download size={14} />Export JSON</Button>
            </Card>
            <Card icon={<FileText size={16} />} title="PDF" desc="Printable question sheet with rendered slides, and a separate answer key with alternatives and hints.">
              <Button disabled={!!busy} onClick={() => doPdf(false)}><Download size={14} />Question sheet</Button>
              <Button disabled={!!busy} onClick={() => doPdf(true)} data-testid="export-answer-key"><Download size={14} />Answer key</Button>
            </Card>
            <Card icon={<Presentation size={16} />} title="PowerPoint (.pptx)" desc="Question + answer slide per question, rendered at full resolution; audio clues embedded as WAV; answers in speaker notes. Progressive reveals and timers are not interactive in PowerPoint.">
              <Button disabled={!!busy} onClick={doPptx}><Download size={14} />Export PPTX</Button>
            </Card>
            <Card icon={<HardDrive size={16} />} title="Full backup" desc="Everything in this browser: all questions, media, quizzes, collections and templates. Recommended weekly — browser storage can be cleared.">
              <Button variant="primary" disabled={!!busy} onClick={doBackup}><Download size={14} />Download backup</Button>
              <Button variant="ghost" onClick={checkStorage}>Check storage</Button>
              <Button variant="ghost" onClick={async () => { const ok = await navigator.storage?.persist?.(); toast.info(ok ? 'Persistent storage granted' : 'Browser declined persistent storage'); void checkStorage(); }}>Request persistence</Button>
              {estimate && <p className="w-full text-[11px] text-muted">{estimate}</p>}
            </Card>
            <Card icon={<Upload size={16} />} title="Import" desc="ZIP packages and backups are fully validated (version, structure, schemas, file types, hashes, references, size limits) before anything is written. Existing items are never overwritten — conflicts import as copies.">
              <Button variant="primary" disabled={!!busy} onClick={doImport} data-testid="import-file"><Upload size={14} />Import ZIP or JSON</Button>
            </Card>
          </div>
          {importErr && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs" role="alert">
              <div className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle size={14} />{importErr.message}</div>
              <ul className="mt-1 list-disc pl-5">{importErr.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title="Import package" description="Validation passed. Review the contents before importing."
        footer={<><Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button><Button variant="primary" onClick={confirmImport} data-testid="confirm-import">Import</Button></>}>
        {preview && (
          <div className="flex flex-col gap-2 text-xs">
            <div>Package type: <b>{preview.manifest.kind}</b> · format v{preview.manifest.formatVersion} · created {new Date(preview.manifest.createdAt).toLocaleString()}</div>
            <div>{preview.questions.length} questions · {preview.quizzes.length} quizzes · {preview.rounds.length} rounds · {preview.manifest.assets.length} media files · {preview.templates.length} templates · {preview.collections.length} collections</div>
            {preview.warnings.length > 0 && <div className="rounded bg-amber-500/10 p-2 text-amber-500">{preview.warnings.slice(0, 10).map((w, i) => <div key={i}>⚠ {w}</div>)}</div>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

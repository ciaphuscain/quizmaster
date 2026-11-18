import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Presentation, MonitorUp } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/app/AppLayout';
import { Button, Kbd } from '@/components/ui/primitives';
import { useSettings } from '@/stores/settings';

export default function PresentationStudio() {
  const navigate = useNavigate();
  const quizzes = useLiveQuery(() => db.quizzes.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const refs = useLiveQuery(() => db.quizQuestionRefs.toArray(), []) ?? [];
  const sc = useSettings((s) => s.settings.shortcuts);
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Presentation Studio" subtitle="Host a live quiz with a private host view and a separate audience screen" />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-2">
            {quizzes.length === 0 && <div className="rounded-lg border border-line bg-panel p-6 text-center text-sm text-muted">Create a quiz in the Round Builder first. <Button variant="ghost" onClick={() => navigate('/quizzes')}>Open Round Builder</Button></div>}
            {quizzes.map((q) => {
              const n = refs.filter((r) => r.quizId === q.id).length;
              return (
                <div key={q.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
                  <div className="flex-1"><div className="text-sm font-semibold">{q.title}</div><div className="text-xs text-muted">{n} questions</div></div>
                  <Button variant="primary" disabled={!n} onClick={() => window.open(`/present/${q.id}`, '_blank')}><Presentation size={14} />Start</Button>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-line bg-panel p-4 text-xs">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><MonitorUp size={15} />Dual-screen setup</div>
            <ol className="list-decimal space-y-1 pl-4 text-muted">
              <li>Start a quiz — the host view opens in a new tab.</li>
              <li>Click <b>Open audience window</b> and drag it to the projector / second display, then press <Kbd>F</Kbd> for fullscreen.</li>
              <li>The audience window only receives revealed information. Answers, notes and unrevealed hints stay on the host screen.</li>
              <li>If the audience window is refreshed or closed, it reconnects automatically while the host tab is open.</li>
            </ol>
            <div className="mb-1 mt-4 font-semibold">Shortcuts (configurable in Settings)</div>
            <ul className="space-y-1 text-muted">{Object.entries(sc).map(([a, k]) => <li key={a} className="flex justify-between"><span>{a.replace(/([A-Z])/g, ' $1').toLowerCase()}</span><Kbd>{k === ' ' ? 'Space' : k}</Kbd></li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}

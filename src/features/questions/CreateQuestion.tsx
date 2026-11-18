import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/app/AppLayout';
import { GAME_LIST, GAMES } from '@/games/registry';
import { GameIcon } from '@/components/common/GameIcon';
import { Button } from '@/components/ui/primitives';
import { templatesRepo } from '@/db/repositories/other';
import type { GameType, Template } from '@/types/schema';
import { createAndSave } from './actions';
import { toast, errorMessage } from '@/components/ui/overlays';
import { TemplatePreview } from '@/features/templates/TemplatePreview';
import { cn } from '@/utils/misc';

const FAMILIES = ['Logos', 'Countries', 'Silhouettes', 'Movies', 'Music'] as const;

export default function CreateQuestion() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [game, setGame] = useState<GameType | null>((params.get('game') as GameType) || null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (game) void templatesRepo.list(game).then(setTemplates); }, [game]);
  const create = async (templateId?: string) => {
    if (!game || busy) return;
    setBusy(true);
    try { const q = await createAndSave(game, templateId); navigate(`/edit/${q.id}`); }
    catch (e) { toast.error('Could not create question', errorMessage(e)); setBusy(false); }
  };
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Create Question" subtitle="Choose a game mode, then start blank or from a template" />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          {FAMILIES.map((f) => (
            <section key={f} className="mb-5">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{f}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {GAME_LIST.filter((g) => g.family === f).map((g) => (
                  <button key={g.type} data-testid={`game-${g.type}`} onClick={() => setGame(g.type)} onDoubleClick={() => { setGame(g.type); void createAndSave(g.type).then((q) => navigate(`/edit/${q.id}`)); }}
                    className={cn('flex items-start gap-3 rounded-lg border border-line bg-panel p-3 text-left hover:border-accent/60', game === g.type && 'border-accent ring-1 ring-accent')}>
                    <div className="mt-0.5 rounded-md p-1.5" style={{ background: `${g.color}22` }}><GameIcon type={g.type} size={18} /></div>
                    <div><div className="text-[13px] font-medium">{g.name}</div><div className="text-xs text-muted">{g.description}</div></div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      {game && (
        <div className="border-t border-line bg-panel px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <GameIcon type={game} size={18} />
            <div className="text-sm font-medium">{GAMES[game].name}</div>
            <div className="flex flex-1 gap-2 overflow-x-auto py-1">
              {templates.map((t) => (
                <button key={t.id} onClick={() => create(t.id)} className="flex shrink-0 flex-col gap-1 rounded-md border border-line p-1.5 text-left hover:border-accent" title={t.description}>
                  <TemplatePreview template={t} width={128} />
                  <span className="w-32 truncate text-[11px]">{t.name}</span>
                </button>
              ))}
            </div>
            <Button variant="primary" size="lg" onClick={() => create()} disabled={busy} data-testid="create-blank">Create blank</Button>
          </div>
        </div>
      )}
    </div>
  );
}

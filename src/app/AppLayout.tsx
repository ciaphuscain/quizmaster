import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { LayoutDashboard, Library, PlusCircle, Images, FolderKanban, ListOrdered, LayoutTemplate, Presentation, ArrowLeftRight, Settings, History, Sun, Moon } from 'lucide-react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { db } from '@/db/database';
import { Button } from '@/components/ui/primitives';
import { useSettings } from '@/stores/settings';
import { GAMES } from '@/games/registry';
import { cn } from '@/utils/misc';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/questions', label: 'Question Bank', icon: Library },
  { to: '/create', label: 'Create Question', icon: PlusCircle },
  { to: '/media', label: 'Media Library', icon: Images },
  { to: '/collections', label: 'Collections', icon: FolderKanban },
  { to: '/quizzes', label: 'Round Builder', icon: ListOrdered },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/presentation', label: 'Presentation', icon: Presentation },
  { to: '/import-export', label: 'Import / Export', icon: ArrowLeftRight },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const navigate = useNavigate();
  const recent = useLiveQuery(() => db.summaries.orderBy('updatedAt').reverse().limit(12).toArray(), []);
  const currentQuiz = useLiveQuery(() => db.quizzes.orderBy('updatedAt').reverse().first(), []);
  const { settings, update } = useSettings();
  return (
    <div className="flex h-full">
      <nav aria-label="Main" className="flex w-52 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 px-4 py-3.5">
          <img src="/icon.svg" alt="" className="h-6 w-6" />
          <div className="text-[13px] font-semibold tracking-tight">Quizmaster Studio</div>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-panel-2 hover:text-fg', isActive && 'bg-panel-3 text-fg font-medium')}>
              <n.icon size={15} />{n.label}
            </NavLink>
          ))}
        </div>
        <div className="border-t border-line p-2 text-[11px] text-muted">
          {currentQuiz && (
            <button className="mb-1 w-full truncate rounded px-2 py-1.5 text-left hover:bg-panel-2" onClick={() => navigate(`/quizzes/${currentQuiz.id}`)}>
              <div className="uppercase tracking-wide text-[10px]">Current quiz</div>
              <div className="truncate text-[12px] text-fg">{currentQuiz.title}</div>
            </button>
          )}
          <div className="flex gap-1">
            <Dropdown.Root>
              <Dropdown.Trigger asChild><Button variant="ghost" size="sm" className="flex-1"><History size={13} />Recent</Button></Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content side="right" align="end" className="z-50 w-72 rounded-md border border-line bg-panel p-1 shadow-xl">
                  {!recent?.length && <div className="p-2 text-xs text-muted">No questions yet</div>}
                  {recent?.map((r) => (
                    <Dropdown.Item key={r.id} onSelect={() => navigate(`/edit/${r.id}`)} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-panel-3">
                      <span className="h-2 w-2 rounded-full" style={{ background: GAMES[r.gameType].color }} />
                      <span className="flex-1 truncate">{r.title}</span>
                      <span className="text-muted">{GAMES[r.gameType].short}</span>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
            <Button variant="ghost" size="icon-sm" tooltip={settings.theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>
              {settings.theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </Button>
          </div>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-hidden"><Outlet /></main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line bg-panel px-6 py-3">
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}

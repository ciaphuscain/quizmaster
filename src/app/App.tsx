import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { AppLayout } from './AppLayout';
import { Toaster, AskHost } from '@/components/ui/overlays';
import { useSettings } from '@/stores/settings';
import { ErrorBoundary } from './ErrorBoundary';

const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'));
const QuestionBank = lazy(() => import('@/features/question-bank/QuestionBank'));
const CreateQuestion = lazy(() => import('@/features/questions/CreateQuestion'));
const EditorPage = lazy(() => import('@/features/questions/EditorPage'));
const MediaLibrary = lazy(() => import('@/features/media-library/MediaLibrary'));
const Collections = lazy(() => import('@/features/collections/Collections'));
const Quizzes = lazy(() => import('@/features/round-builder/Quizzes'));
const RoundBuilder = lazy(() => import('@/features/round-builder/RoundBuilder'));
const Templates = lazy(() => import('@/features/templates/Templates'));
const PresentationStudio = lazy(() => import('@/features/presentation/PresentationStudio'));
const HostView = lazy(() => import('@/features/presentation/HostView'));
const AudienceView = lazy(() => import('@/features/presentation/AudienceView'));
const ImportExport = lazy(() => import('@/features/exports/ImportExport'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

function Loading() {
  return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;
}

function Root() {
  const { load, settings, loaded } = useSettings();
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
  }, [settings.theme, settings.reducedMotion]);
  if (!loaded) return <Loading />;
  return (
    <TooltipPrimitive.Provider>
      <ErrorBoundary>
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </ErrorBoundary>
      <Toaster />
      <AskHost />
    </TooltipPrimitive.Provider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/audience', element: <AudienceView /> },
      { path: '/present/:quizId', element: <HostView /> },
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/questions', element: <QuestionBank /> },
          { path: '/create', element: <CreateQuestion /> },
          { path: '/edit/:id', element: <EditorPage /> },
          { path: '/media', element: <MediaLibrary /> },
          { path: '/collections', element: <Collections /> },
          { path: '/quizzes', element: <Quizzes /> },
          { path: '/quizzes/:id', element: <RoundBuilder /> },
          { path: '/templates', element: <Templates /> },
          { path: '/presentation', element: <PresentationStudio /> },
          { path: '/import-export', element: <ImportExport /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '*', element: <div className="p-8 text-muted">Page not found.</div> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

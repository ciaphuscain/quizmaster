import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-lg font-semibold">Something went wrong</div>
        <pre className="max-w-xl whitespace-pre-wrap rounded bg-panel-2 p-3 text-left text-xs text-muted">{this.state.error.message}</pre>
        <p className="text-sm text-muted">Your work is saved locally. Reload to continue.</p>
        <button className="rounded bg-accent px-3 py-1.5 text-accent-fg" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

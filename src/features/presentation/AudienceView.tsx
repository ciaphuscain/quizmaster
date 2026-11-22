import { useEffect, useRef, useState } from 'react';
import { AudienceDisplay } from './AudienceDisplay';
import { CHANNEL, type ChannelMsg, type PublicState } from './model';
import { uid } from '@/utils/id';

/** Separate audience window. Receives only PublicState + a pre-rendered public slide image. */
export default function AudienceView() {
  const [state, setState] = useState<PublicState | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const last = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = uid('aud');
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent<ChannelMsg>) => {
      const m = e.data;
      last.current = Date.now(); setConnected(true);
      if (m.type === 'state') {
        setState(m.state);
        setUrl((old) => { if (old) setTimeout(() => URL.revokeObjectURL(old), 2000); return m.slide ? URL.createObjectURL(m.slide) : null; });
      } else if (m.type === 'ping') ch.postMessage({ type: 'pong', id } satisfies ChannelMsg);
      else if (m.type === 'bye') { setConnected(false); setState(null); }
    };
    ch.postMessage({ type: 'hello', id } satisfies ChannelMsg);
    const t = setInterval(() => { if (Date.now() - last.current > 6000) { setConnected(false); ch.postMessage({ type: 'hello', id } satisfies ChannelMsg); } }, 2000);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'f' || e.key === 'F') void (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen()); };
    window.addEventListener('keydown', onKey);
    document.title = 'Quizmaster — Audience';
    return () => { clearInterval(t); ch.close(); window.removeEventListener('keydown', onKey); };
  }, []);
  return (
    <div ref={ref} className="h-screen w-screen cursor-none bg-black" onDoubleClick={() => void ref.current?.requestFullscreen()}>
      <AudienceDisplay state={connected ? state : null} slideUrl={url} connected={connected} />
    </div>
  );
}

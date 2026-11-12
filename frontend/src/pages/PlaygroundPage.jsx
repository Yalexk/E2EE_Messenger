import { useEffect } from 'react';
import { usePlayground } from '../playground/usePlayground.js';
import { Stepper } from '../playground/Stepper.jsx';
import { Stage } from '../playground/Stage.jsx';
import { PartyPanel } from '../playground/PartyPanel.jsx';
import { ServerPanel } from '../playground/ServerPanel.jsx';
import { Button } from '../components/ui.jsx';

export default function PlaygroundPage() {
  const pg = usePlayground();
  const { state, step, busy, playing, setPlaying, next, reset, skipToChat, setOption, chat } = pg;

  useEffect(() => {
    document.title = 'Playground · x3dh';
  }, []);

  // The right arrow advances, unless you're typing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowRight' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next]);

  const atEnd = step.id === 'chat';

  return (
    <div className="wrap py-8 sm:py-10">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-(length:--text-section) text-ink">Playground</h1>
          <p className="mt-2 text-ink-2">Alice, a server and Bob, all in your browser.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>reset</Button>
          <Button size="sm" onClick={() => setPlaying(!playing)} disabled={atEnd || !pg.canAdvance}>
            {playing ? 'pause' : 'autoplay'}
          </Button>
          <Button size="sm" onClick={skipToChat} disabled={atEnd || busy}>skip to chat</Button>
        </div>
      </div>

      <div className="mt-6">
        <Stepper current={state.step} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)_minmax(16rem,21rem)]">
        <div className="order-2 lg:order-1">
          <PartyPanel party="alice" state={state} stepId={step.id} onChat={chat} busy={busy} />
        </div>
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <Stage pg={pg} />
          <ServerPanel state={state} onOption={setOption} />
        </div>
        <div className="order-3">
          <PartyPanel party="bob" state={state} stepId={step.id} onChat={chat} busy={busy} />
        </div>
      </div>
    </div>
  );
}

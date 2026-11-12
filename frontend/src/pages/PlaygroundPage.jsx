import { useEffect } from 'react';
import { FastForward, Pause, Play, RotateCcw } from 'lucide-react';
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
    document.title = 'Playground · X3DH, explained by running it';
  }, []);

  // → advances, unless you're typing.
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
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">X3DH Playground</h1>
          <p className="mt-1 text-ink-300">Alice, an untrusted server, and Bob, all running in your browser. Nothing here touches a network.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
            <RotateCcw className="size-4" /> Reset
          </Button>
          <Button size="sm" onClick={() => setPlaying(!playing)} disabled={atEnd || !pg.canAdvance}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />} {playing ? 'Pause' : 'Autoplay'}
          </Button>
          <Button size="sm" onClick={skipToChat} disabled={atEnd || busy}>
            <FastForward className="size-4" /> Skip to chat
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <Stepper current={state.step} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)_minmax(17rem,22rem)]">
        <div className="order-2 lg:order-1">
          <PartyPanel party="alice" state={state} stepId={step.id} onChat={chat} busy={busy} />
        </div>
        <div className="order-1 flex flex-col gap-5 lg:order-2">
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

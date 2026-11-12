import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { STEPS } from './engine.js';
import { cx } from '../lib/format.js';

const ACTOR_DOT = { alice: 'bg-alice', bob: 'bg-bob', both: 'bg-gradient-to-r from-alice to-bob' };

export function Stepper({ current }) {
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current]);

  return (
    <ol className="scrollbar-thin flex gap-1 overflow-x-auto pb-1" aria-label="Protocol steps">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={s.id}
            ref={active ? activeRef : null}
            aria-current={active ? 'step' : undefined}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition-colors',
              active && 'border-ink-400 bg-ink-800 text-ink-100',
              done && 'border-transparent text-ink-300',
              !active && !done && 'border-transparent text-ink-500',
            )}
          >
            <span
              className={cx(
                'grid size-4.5 place-items-center rounded-full font-mono text-[10px] font-bold text-ink-900',
                done ? 'bg-ink-300' : active ? ACTOR_DOT[s.actor] : 'bg-ink-700 text-ink-400',
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i}
            </span>
            {s.title}
          </li>
        );
      })}
    </ol>
  );
}

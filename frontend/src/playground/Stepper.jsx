import { useEffect, useRef } from 'react';
import { STEPS } from './engine.js';
import { cx } from '../lib/format.js';

export function Stepper({ current }) {
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current]);

  return (
    <ol className="scroll-thin flex overflow-x-auto border border-rule [mask-image:linear-gradient(to_right,var(--color-paper)_88%,transparent)]" aria-label="Steps">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={s.id}
            ref={active ? activeRef : null}
            aria-current={active ? 'step' : undefined}
            className={cx(
              'shrink-0 border-r border-rule px-3 py-2 text-xs whitespace-nowrap last:border-r-0',
              active ? 'bg-accent-wash text-ink' : done ? 'text-ink-2' : 'text-muted',
            )}
          >
            <span className={cx('mr-1.5', active ? 'text-accent' : 'text-muted')}>{i}</span>
            {s.title}
          </li>
        );
      })}
    </ol>
  );
}

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { hex, cx } from '../lib/format.js';

// One hue only: key types are told apart by name and by brightness step.
export const KEY_INFO = {
  IK: { color: 'text-accent', name: 'Identity key', blurb: 'Long-term. Says who you are.' },
  SPK: { color: 'text-ink', name: 'Signed prekey', blurb: 'Signed by the identity key. Replaced weekly.' },
  OPK: { color: 'text-ink-2', name: 'One-time prekey', blurb: 'Used for one handshake, then deleted.' },
  EK: { color: 'text-glyph-6', name: 'Ephemeral key', blurb: 'Made for one handshake, then deleted.' },
  SK: { color: 'text-accent', name: 'Shared secret', blurb: 'Both sides compute it. It is never sent.' },
  SIG: { color: 'text-muted', name: 'Signature', blurb: 'Proves the identity key signed the prekey.' },
};

/** A key name like IK_A, with the owner as a subscript. */
export function KeyName({ kind, owner, className }) {
  return (
    <span className={cx('font-semibold whitespace-nowrap', KEY_INFO[kind]?.color, className)}>
      {kind}
      {owner && <sub className="ml-px text-[0.7em]">{owner}</sub>}
    </span>
  );
}

/** A key. Click to show its bytes. Private keys stay masked until opened. */
export function KeyChip({ kind, owner, label, value, secret, deleted, highlight, className, expandable = true }) {
  const [open, setOpen] = useState(false);
  const info = KEY_INFO[kind];
  const canOpen = expandable && value != null && !deleted;
  return (
    <div
      className={cx(
        'border px-2.5 py-1.5',
        highlight ? 'border-accent bg-accent-wash' : 'border-rule bg-paper-2',
        deleted && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => canOpen && setOpen((o) => !o)}
        className={cx('stepped flex w-full items-center gap-2 text-left', canOpen ? 'hover:text-ink' : 'cursor-default')}
        title={`${info.name}${secret ? ' (private)' : ' (public)'}. ${info.blurb}`}
        aria-expanded={canOpen ? open : undefined}
      >
        <span className={cx(deleted && 'line-through')}>{label ?? <KeyName kind={kind} owner={owner} className="text-sm" />}</span>
        {secret && <Lock className="size-3 text-muted" aria-label="private" />}
        {deleted ? (
          <span className="ml-auto text-xs text-muted">deleted</span>
        ) : (
          value != null && (
            <span className="ml-auto truncate text-xs text-muted">
              {secret && !open ? '****' : hex(value, { short: true, head: 6, tail: 4 })}
            </span>
          )
        )}
      </button>
      {open && canOpen && <p className="mt-1.5 text-[11px] leading-relaxed break-all text-ink-2">{hex(value)}</p>}
    </div>
  );
}

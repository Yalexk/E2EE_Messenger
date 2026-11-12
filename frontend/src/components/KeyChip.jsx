import { useState } from 'react';
import { Lock, Trash2 } from 'lucide-react';
import { hex, cx } from '../lib/format.js';

export const KEY_INFO = {
  IK: { color: 'text-ik', ring: 'border-ik/40', bg: 'bg-ik/10', name: 'Identity key', blurb: 'Long-term. Identifies the person.' },
  SPK: { color: 'text-spk', ring: 'border-spk/40', bg: 'bg-spk/10', name: 'Signed prekey', blurb: 'Medium-term, signed by the identity key, rotated every week or so.' },
  OPK: { color: 'text-opk', ring: 'border-opk/40', bg: 'bg-opk/10', name: 'One-time prekey', blurb: 'Used for exactly one handshake, then deleted.' },
  EK: { color: 'text-ek', ring: 'border-ek/40', bg: 'bg-ek/10', name: 'Ephemeral key', blurb: 'Made fresh for this handshake, deleted right after.' },
  SK: { color: 'text-sk', ring: 'border-sk/40', bg: 'bg-sk/10', name: 'Shared secret', blurb: 'The 256-bit key both sides derive. Never sent.' },
  SIG: { color: 'text-ink-200', ring: 'border-ink-500', bg: 'bg-ink-700/60', name: 'Signature', blurb: 'Ed25519 signature over SPK by IK.' },
};

/** Renders a label like IK_A with the owner as a subscript. */
export function KeyName({ kind, owner, className }) {
  const info = KEY_INFO[kind];
  return (
    <span className={cx('font-mono font-semibold', info?.color, className)}>
      {kind}
      {owner && <sub className="ml-px text-[0.7em]">{owner}</sub>}
    </span>
  );
}

/**
 * A key, colour-coded by type. Click to reveal the hex bytes.
 * `secret` keys show a lock; `deleted` keys are struck through.
 */
export function KeyChip({ kind, owner, label, value, secret, deleted, dim, highlight, className, expandable = true }) {
  const [open, setOpen] = useState(false);
  const info = KEY_INFO[kind];
  const canOpen = expandable && value != null && !deleted;
  return (
    <div
      className={cx(
        'group rounded-lg border px-2.5 py-1.5 transition-all animate-fade-in',
        info.ring,
        info.bg,
        dim && 'opacity-40',
        deleted && 'opacity-50',
        highlight && 'ring-2 ring-offset-2 ring-offset-ink-850 ring-current',
        highlight && info.color,
        className,
      )}
    >
      <button
        type="button"
        onClick={() => canOpen && setOpen((o) => !o)}
        className={cx('flex w-full items-center gap-2 text-left', !canOpen && 'cursor-default')}
        title={`${info.name}${secret ? ' (private)' : ' (public)'}: ${info.blurb}`}
        aria-expanded={canOpen ? open : undefined}
      >
        {label ?? <KeyName kind={kind} owner={owner} className="text-sm" />}
        {secret && <Lock className={cx('size-3', info.color)} aria-label="private key" />}
        {deleted ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-ink-400">
            <Trash2 className="size-3" /> deleted
          </span>
        ) : (
          value != null && (
            <span className={cx('ml-auto truncate font-mono text-xs', secret ? 'text-ink-400' : 'text-ink-300')}>
              {secret && !open ? '•••••••' : hex(value, { short: true, head: 6, tail: 4 })}
            </span>
          )
        )}
      </button>
      {open && canOpen && (
        <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-ink-200">{hex(value)}</p>
      )}
    </div>
  );
}

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../lib/format.js';

const VARIANTS = {
  primary: 'bg-ink-100 text-ink-900 hover:bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_24px_-8px_rgba(167,139,250,0.5)]',
  secondary: 'bg-ink-800 text-ink-100 border border-ink-600 hover:border-ink-500 hover:bg-ink-700',
  ghost: 'text-ink-300 hover:text-ink-100 hover:bg-ink-800',
  danger: 'bg-eve/15 text-eve border border-eve/40 hover:bg-eve/25',
};
const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export const Button = forwardRef(function Button(
  { as: As = 'button', variant = 'secondary', size = 'md', loading = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <As
      ref={ref}
      className={cx(
        'inline-flex select-none items-center justify-center rounded-xl font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={As === 'button' ? disabled || loading : undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </As>
  );
});

export function Toggle({ checked, onChange, label, description, tone = 'eve', disabled }) {
  const on = { eve: 'bg-eve', alice: 'bg-alice', bob: 'bg-bob', spk: 'bg-spk' }[tone];
  return (
    <div className={cx('flex items-start gap-3', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed', checked ? on : 'bg-ink-600')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform', checked && 'translate-x-4')} />
      </button>
      <div className="text-sm leading-snug">
        <p className="font-medium text-ink-100">{label}</p>
        {description && <p className="text-ink-400">{description}</p>}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', className, children }) {
  const tones = {
    neutral: 'bg-ink-700 text-ink-200',
    ok: 'bg-bob/15 text-bob',
    bad: 'bg-eve/15 text-eve',
    alice: 'bg-alice/15 text-alice',
    bob: 'bg-bob/15 text-bob',
    warn: 'bg-ik/15 text-ik',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Field({ label, error, className, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-200">{label}</span>
      <input
        className={cx(
          'h-11 w-full rounded-xl border bg-ink-900 px-3.5 text-ink-100 placeholder:text-ink-500 transition-colors',
          'focus:border-alice focus:outline-none',
          error ? 'border-eve' : 'border-ink-600',
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function SectionLabel({ children, className }) {
  return <p className={cx('font-mono text-xs uppercase tracking-[0.18em] text-ink-400', className)}>{children}</p>;
}

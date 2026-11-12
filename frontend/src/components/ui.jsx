import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../lib/format.js';

const VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-glyph-6 active:bg-glyph-4',
  secondary: 'border border-ink-2 text-ink hover:bg-paper-3 active:bg-accent-wash',
  ghost: 'text-ink-2 hover:bg-paper-3 hover:text-ink active:bg-accent-wash',
};
const SIZES = {
  sm: 'h-8 px-3 text-sm gap-2',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2.5',
};

export const Button = forwardRef(function Button(
  { as: As = 'button', variant = 'secondary', size = 'md', loading = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <As
      ref={ref}
      className={cx(
        'stepped inline-flex select-none items-center justify-center font-medium whitespace-nowrap no-underline',
        'disabled:opacity-50 aria-busy:opacity-70',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={As === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
      {children}
    </As>
  );
});

/** A switch drawn as a checkbox in the terminal: [x] on, [ ] off. */
export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <div className={cx('flex items-start gap-3', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'stepped shrink-0 px-1 font-semibold hover:bg-paper-3 active:bg-accent-wash',
          checked ? 'text-accent' : 'text-muted',
        )}
      >
        {checked ? '[x]' : '[ ]'}
      </button>
      <div className="text-sm">
        <p className="text-ink">{label}</p>
        {description && <p className="text-muted">{description}</p>}
      </div>
    </div>
  );
}

export function Field({ label, error, className, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-2">{label}</span>
      <input
        className={cx(
          'stepped h-11 w-full border bg-paper px-3 text-ink placeholder:text-muted',
          'hover:border-ink-2 focus:border-accent focus:outline-none',
          error ? 'border-ink' : 'border-rule-2',
          className,
        )}
        {...props}
      />
    </label>
  );
}

/** A small label, written like a shell comment. */
export function Label({ children, className }) {
  return <p className={cx('text-sm text-muted', className)}># {children}</p>;
}

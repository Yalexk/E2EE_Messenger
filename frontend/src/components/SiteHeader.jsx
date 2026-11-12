import { NavLink, Link } from 'react-router-dom';
import { cx } from '../lib/format.js';

export const REPO_URL = import.meta.env.VITE_REPO_URL ?? 'https://github.com/Yalexk/E2EE_Messenger';

export function Logo({ className }) {
  return (
    <Link to="/" className={cx('stepped flex h-full items-center bg-accent px-4 font-bold text-accent-ink no-underline hover:bg-glyph-6', className)}>
      x3dh
    </Link>
  );
}

const linkClass = ({ isActive }) =>
  cx('stepped flex h-full items-center px-3 text-sm no-underline', isActive ? 'bg-accent-wash text-ink' : 'text-ink-2 hover:bg-paper-3 hover:text-ink');

export function SiteHeader({ fullBleed = false }) {
  return (
    <header className="sticky top-0 z-(--z-sticky-nav) border-b border-rule bg-paper">
      <div className={cx("flex h-12 items-stretch gap-1", fullBleed ? "w-full" : "wrap !px-0 sm:!px-(--gutter)")}>
        <Logo />
        <nav className="flex items-stretch" aria-label="Main">
          <NavLink to="/playground" className={linkClass}>playground</NavLink>
          <NavLink to="/chat" className={linkClass}>live chat</NavLink>
        </nav>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="stepped ml-auto flex items-center border-l border-rule px-4 text-sm text-ink-2 no-underline hover:bg-paper-3 hover:text-ink">
          source
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="wrap grid gap-6 py-12 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
        <p className="w-fit bg-accent px-3 py-1 font-bold text-accent-ink">x3dh</p>
        <div className="max-w-[52ch] space-y-2 text-sm text-muted">
          <p>A learning project: Signal’s X3DH key agreement, built from scratch and shown step by step. Not a replacement for Signal.</p>
          <p>Built by Alex Yecies. Revamped in 2026 with help from an AI coding assistant.</p>
        </div>
        <ul className="flex gap-5 text-sm">
          <li><a href="https://signal.org/docs/specifications/x3dh/" target="_blank" rel="noreferrer" className="text-ink-2 decoration-dotted hover:text-accent">X3DH spec</a></li>
          <li><a href={REPO_URL} target="_blank" rel="noreferrer" className="text-ink-2 decoration-dotted hover:text-accent">source</a></li>
        </ul>
      </div>
    </footer>
  );
}

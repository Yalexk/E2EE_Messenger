import { NavLink, Link } from 'react-router-dom';
import { Github, KeyRound } from 'lucide-react';
import { cx } from '../lib/format.js';

export const REPO_URL = import.meta.env.VITE_REPO_URL ?? 'https://github.com/Yalexk/E2EE_Messenger';

export function Logo({ className }) {
  return (
    <Link to="/" className={cx('group inline-flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <span className="relative grid size-8 place-items-center rounded-lg bg-gradient-to-br from-alice to-bob text-ink-900">
        <KeyRound className="size-4.5" strokeWidth={2.5} />
      </span>
      <span>
        X3DH<span className="text-ink-400">.chat</span>
      </span>
    </Link>
  );
}

const linkClass = ({ isActive }) =>
  cx('rounded-lg px-3 py-1.5 text-sm transition-colors', isActive ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:text-ink-100');

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-900/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-auto flex items-center gap-1" aria-label="Main">
          <NavLink to="/playground" className={linkClass}>
            Playground
          </NavLink>
          <NavLink to="/chat" className={linkClass}>
            Live chat
          </NavLink>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="ml-1 rounded-lg p-2 text-ink-300 hover:bg-ink-800 hover:text-ink-100" aria-label="Source on GitHub">
            <Github className="size-4.5" />
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-700/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-ink-400 sm:flex-row sm:items-center sm:px-6">
        <p>Built to learn and to teach how Signal's X3DH key agreement works. Not a substitute for Signal.</p>
        <a href="https://signal.org/docs/specifications/x3dh/" target="_blank" rel="noreferrer" className="hover:text-ink-200 sm:ml-auto">
          Read the X3DH spec ↗
        </a>
      </div>
    </footer>
  );
}

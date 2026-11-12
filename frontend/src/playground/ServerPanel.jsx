import { AnimatePresence, motion as Motion } from 'motion/react';
import { ArrowRight, Eye, Server } from 'lucide-react';
import { KeyChip } from '../components/KeyChip.jsx';
import { SectionLabel, Toggle } from '../components/ui.jsx';
import { shortB64, cx } from '../lib/format.js';
import { stepIndex } from './engine.js';

const WHO = { alice: 'text-alice', bob: 'text-bob', server: 'text-server' };
const NAME = { alice: 'Alice', bob: 'Bob', server: 'Server' };

export function ServerPanel({ state, onOption }) {
  const { server, packets, options, step } = state;
  const beforeFetch = step < stepIndex('fetch');
  return (
    <section className="card flex flex-col gap-4 border-server/20 p-4" aria-label="Server">
      <header className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-ink-700 text-server">
          <Server className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-server">Server</h2>
          <p className="text-xs text-ink-400">Untrusted relay and key directory</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-xs text-ink-300" title="This panel shows everything the server ever sees">
          <Eye className="size-3.5" /> sees all of this
        </span>
      </header>

      {server.bundle && (
        <div className="space-y-1.5">
          <SectionLabel>Stored: Bob's prekey bundle</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <KeyChip kind="IK" owner="B" value={server.bundle.identityKey} />
            <KeyChip kind="SPK" owner="B" value={server.bundle.signedPreKey} />
          </div>
          <KeyChip kind="SIG" label={<span className="font-mono text-sm font-semibold text-ink-200">Sig(IK<sub>B</sub>, SPK<sub>B</sub>)</span>} value={server.bundle.signedPreKeySignature} />
          <div className="flex flex-wrap gap-1.5" aria-label="One-time prekeys on the server">
            {server.opks.map((k) => (
              <span
                key={k.id}
                className={cx('rounded-md border px-2 py-0.5 font-mono text-xs transition-opacity', k.taken ? 'border-ink-700 text-ink-500 line-through' : 'border-opk/40 bg-opk/10 text-opk')}
                title={k.taken ? 'Handed out and deleted' : 'Available'}
              >
                OPK<sub>B{k.label.slice(-1)}</sub>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <SectionLabel>Wire log</SectionLabel>
        {packets.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing has crossed the network yet.</p>
        ) : (
          <ol className="scrollbar-thin flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {[...packets].reverse().map((p) => (
                <Motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, x: p.from === 'bob' ? 24 : p.from === 'alice' ? -24 : 0, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  className={cx('rounded-xl border bg-ink-900/70 p-2.5', p.tampered ? 'border-eve/50' : 'border-ink-700')}
                >
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <span className={WHO[p.from]}>{NAME[p.from]}</span>
                    <ArrowRight className="size-3 text-ink-500" />
                    <span className={WHO[p.to]}>{NAME[p.to]}</span>
                    <span className={cx('ml-auto truncate', p.tampered ? 'text-eve' : 'text-ink-400')}>{p.kind}</span>
                  </p>
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[11px]">
                    {p.fields.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-ink-400">{k}</dt>
                        <dd className="truncate text-ink-200" title={v}>{shortB64(v, 28)}</dd>
                      </div>
                    ))}
                  </dl>
                </Motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-eve/20 bg-eve/5 p-3">
        <SectionLabel className="text-eve/80">Try to break it</SectionLabel>
        <Toggle
          checked={options.tamperSpk}
          onChange={(v) => onOption('tamperSpk', v)}
          disabled={!beforeFetch}
          label="Malicious server swaps Bob's signed prekey"
          description={beforeFetch ? 'The server gives Alice its own key instead of SPK_B.' : 'Applies before Alice fetches. Reset to try it.'}
        />
        <Toggle
          checked={options.exhaustOpks}
          onChange={(v) => onOption('exhaustOpks', v)}
          disabled={!beforeFetch}
          tone="spk"
          label="Bob's one-time prekeys have run out"
          description="X3DH still works, with three DHs instead of four."
        />
        <Toggle
          checked={options.tamperTransit}
          onChange={(v) => onOption('tamperTransit', v)}
          label="Flip one bit of every chat message in transit"
          description="AES-GCM's auth tag catches any modification."
        />
      </div>
    </section>
  );
}

import { KeyChip } from '../components/KeyChip.jsx';
import { Label, Toggle } from '../components/ui.jsx';
import { shortB64, cx } from '../lib/format.js';
import { stepIndex } from './engine.js';

export function ServerPanel({ state, onOption }) {
  const { server, packets, options, step } = state;
  const beforeFetch = step < stepIndex('fetch');
  return (
    <section className="flex flex-col gap-4 border border-rule p-4" aria-label="Server">
      <header className="flex items-baseline gap-3 border-b border-rule pb-3">
        <h2 className="text-lg text-ink">server</h2>
        <span className="text-sm text-muted">sees everything in this box</span>
      </header>

      {server.bundle && (
        <div className="space-y-1.5">
          <Label>stored: bob’s public keys</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <KeyChip kind="IK" owner="B" value={server.bundle.identityKey} />
            <KeyChip kind="SPK" owner="B" value={server.bundle.signedPreKey} />
          </div>
          <KeyChip kind="SIG" label={<span className="text-sm font-semibold text-muted">signature</span>} value={server.bundle.signedPreKeySignature} />
          <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="One-time prekeys on the server">
            {server.opks.map((k) => (
              <li
                key={k.id}
                className={cx('border px-2 py-0.5', k.taken ? 'border-rule text-muted line-through' : 'border-rule-2 text-ink-2')}
                title={k.taken ? 'Handed out and deleted' : 'Available'}
              >
                OPK<sub>B{k.label.slice(-1)}</sub>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <Label>traffic</Label>
        {packets.length === 0 ? (
          <p className="text-sm text-muted">Nothing sent yet.</p>
        ) : (
          <ol className="scroll-thin flex max-h-72 flex-col gap-2 overflow-y-auto">
            {[...packets].reverse().map((p) => (
              <li key={p.id} className={cx('type-in border p-2.5', p.tampered ? 'border-ink bg-paper-3' : 'border-rule bg-paper-2')}>
                <p className="flex gap-2 text-xs">
                  <span className="text-ink">{p.from} -&gt; {p.to}</span>
                  <span className={cx('ml-auto truncate', p.tampered ? 'text-ink' : 'text-muted')}>{p.kind}</span>
                </p>
                <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-[11px]">
                  {p.fields.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd className="truncate text-ink-2" title={v}>{shortB64(v, 28)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-3 border-t border-rule pt-4">
        <Label>try to break it</Label>
        <Toggle
          checked={options.tamperSpk}
          onChange={(v) => onOption('tamperSpk', v)}
          disabled={!beforeFetch}
          label="Server swaps bob’s signed prekey"
          description={beforeFetch ? 'A dishonest server hands alice its own key.' : 'Only works before alice fetches. Reset to try.'}
        />
        <Toggle
          checked={options.exhaustOpks}
          onChange={(v) => onOption('exhaustOpks', v)}
          disabled={!beforeFetch}
          label="Bob has no one-time prekeys left"
          description="Still works, with 3 steps instead of 4."
        />
        <Toggle
          checked={options.tamperTransit}
          onChange={(v) => onOption('tamperTransit', v)}
          label="Flip one bit of every chat message"
          description="The receiver will notice and reject it."
        />
      </div>
    </section>
  );
}

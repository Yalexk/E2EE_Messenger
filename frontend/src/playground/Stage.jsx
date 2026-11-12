import { PROTOCOL_INFO, equalBytes } from '@e2ee/x3dh';
import { KeyChip, KeyName, KEY_INFO } from '../components/KeyChip.jsx';
import { Button, Label } from '../components/ui.jsx';
import { hex, cx } from '../lib/format.js';

const NEXT_LABEL = {
  intro: 'Make the keys',
  keys: 'Bob uploads his public keys',
  publish: 'Alice fetches them',
  fetch: 'Check the signature',
  verify: 'Make a one-off key',
  ephemeral: 'Run the 4 steps',
  dh: 'Mix them into one key',
  kdf: 'Encrypt and send',
  send: 'Bob comes online',
  receive: 'Start chatting',
};

/** DHn = DH(mine, theirs) -> output, with an optional match mark. */
function DHRow({ step, match }) {
  const [mk, mo] = step.mine.split('_');
  const [tk, to] = step.theirs.split('_');
  return (
    <li className="type-in grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-2.5 last:border-b-0">
      <span className="text-muted">{step.label}</span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span>
            <KeyName kind={mk} owner={mo} /> <span className="text-muted">x</span> <KeyName kind={tk} owner={to} />
          </span>
          <span className="text-muted">=</span>
          <code className="text-xs text-ink-2">{hex(step.out, { short: true, head: 10, tail: 6 })}</code>
          {match !== undefined && <span className="text-xs text-accent">{match ? 'same' : 'different'}</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted">{step.purpose}</p>
      </div>
    </li>
  );
}

const SEGMENT_SHADE = ['bg-glyph-0', 'bg-glyph-2', 'bg-glyph-4', 'bg-glyph-6', 'bg-accent'];

function IkmBar({ steps }) {
  const segments = [{ label: 'FF..', title: '32 bytes of 0xFF' }, ...steps.map((s) => ({ label: s.label, title: hex(s.out, { short: true }) }))];
  return (
    <div className="flex border border-rule-2">
      {segments.map((s, i) => (
        <div key={s.label} className={cx('flex-1 py-1.5 text-center text-xs font-semibold text-accent-ink', SEGMENT_SHADE[i])} title={s.title}>
          {s.label}
        </div>
      ))}
    </div>
  );
}

export function Stage({ pg }) {
  const { state, step, next, busy, canAdvance, draft, setDraft, retryHonestly } = pg;
  const s = state;
  const id = step.id;

  const body = {
    intro: (
      <>
        <p>
          Alice wants to message Bob. Bob is offline, and the server in the middle can’t be trusted. X3DH lets them agree on a
          secret key anyway.
        </p>
        <dl className="mt-5 grid gap-2 text-sm">
          {['IK', 'SPK', 'OPK', 'EK'].map((k) => (
            <div key={k} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
              <dt><KeyName kind={k} /></dt>
              <dd className="text-ink-2">{KEY_INFO[k].name}. {KEY_INFO[k].blurb}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-sm text-muted">Every key here is real and made in your browser. Click one to see it.</p>
      </>
    ),
    keys: (
      <p>
        Both make an identity key (<KeyName kind="IK" />). Bob also makes a signed prekey (<KeyName kind="SPK" />), signs it with
        his identity key, and makes a few one-time prekeys (<KeyName kind="OPK" />). Private halves stay put.
      </p>
    ),
    publish: (
      <p>Bob uploads the public halves, then goes offline. Alice can still start a chat with him.</p>
    ),
    fetch: (
      <>
        <p>Alice asks the server for Bob’s keys. The server hands out one one-time prekey and deletes it, so nobody else gets it.</p>
        {s.delivered?.oneTimePreKey ? (
          <p className="mt-3 text-sm text-ink-2">Alice got <KeyName kind="OPK" owner={`B${s.delivered.oneTimePreKey.label.slice(-1)}`} />.</p>
        ) : (
          <p className="mt-3 text-sm text-ink-2">None left. That’s fine: the handshake uses 3 steps instead of 4.</p>
        )}
      </>
    ),
    verify: s.verify?.ok ? (
      <p>
        <span className="text-accent">ok</span> The signature checks out. Only Bob’s identity key could have signed this prekey,
        so the server didn’t swap it.
      </p>
    ) : (
      <div className="space-y-4">
        <p className="border border-ink bg-paper-3 px-3 py-2">
          error: bad signature. The server swapped in its own prekey, but it can’t fake Bob’s signature. Alice stops here.
        </p>
        <Button size="sm" onClick={retryHonestly} disabled={busy}>Stop the attack and try again</Button>
      </div>
    ),
    ephemeral: (
      <p>Alice makes a fresh one-off key (<KeyName kind="EK" owner="A" />) just for this chat. She’ll delete it soon.</p>
    ),
    dh: s.handshake && (
      <>
        <p className="mb-3">
          Alice combines her keys with Bob’s in {s.handshake.trace.steps.length} Diffie-Hellman steps. Bob will get the same
          outputs later, without either of them sending them.
        </p>
        <ol className="border-t border-rule">
          {s.handshake.trace.steps.map((st) => <DHRow key={st.label} step={st} />)}
        </ol>
      </>
    ),
    kdf: s.handshake && (
      <div className="space-y-4">
        <p>The outputs go through HKDF, a hash for making keys. Out comes the shared key.</p>
        <IkmBar steps={s.handshake.trace.steps} />
        <div className="well p-3 text-xs text-muted">
          <p>hkdf(sha256, info "{PROTOCOL_INFO}")</p>
          <p className="mt-2 text-sm break-all text-accent">{hex(s.handshake.sharedKey)}</p>
        </div>
        <p className="text-sm text-ink-2">Alice deletes <KeyName kind="EK" owner="A" />. Even if her identity key leaks later, nobody can rebuild this key.</p>
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-2">Alice’s first message</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            className="stepped h-10 w-full border border-rule-2 bg-paper px-3 text-sm hover:border-ink-2 focus:border-accent focus:outline-none"
          />
        </label>
      </div>
    ),
    send: s.server.initial && (
      <div className="space-y-3">
        <p>
          Alice encrypts the message with the shared key and sends it with her public keys, so Bob can do the same math. Bob is
          offline, so the server holds it. It can’t read it.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-3">
          <KeyChip kind="IK" owner="A" value={s.server.initial.senderIdentityKey} />
          <KeyChip kind="EK" owner="A" value={s.server.initial.ephemeralKey} />
          <p className="border border-rule bg-paper-2 px-2.5 py-1.5 text-sm text-ink-2">
            used {s.server.initial.oneTimePreKeyLabel ?? 'no OPK'}
          </p>
        </div>
        <p className="well p-3 text-xs break-all text-ink-2">{s.server.initial.ciphertext}</p>
      </div>
    ),
    receive: s.received && (
      <div className="space-y-3">
        <p>Bob comes online and runs the same steps from his side. Every output matches.</p>
        <ol className="border-t border-rule">
          {s.received.trace.steps.map((st, i) => (
            <DHRow key={st.label} step={st} match={equalBytes(st.out, s.handshake.trace.steps[i].out)} />
          ))}
        </ol>
        <div className="border border-accent bg-accent-wash p-3 text-sm">
          <p className="text-ink">{s.received.match ? 'Same key on both sides. It never crossed the network.' : 'The keys differ.'}</p>
          {s.received.plaintext && <p className="mt-1 text-ink-2">Bob reads: “{s.received.plaintext}”</p>}
          <p className="mt-1 text-muted">Bob deletes the one-time prekey he used.</p>
        </div>
      </div>
    ),
    chat: (
      <div className="space-y-3">
        <p>Done. Type as Alice or Bob. The server only ever sees scrambled bytes.</p>
        <p className="text-sm text-ink-2">Tick “flip one bit” in the server box to see a changed message get rejected.</p>
        <p className="text-sm text-muted">
          Signal goes further and changes the key with every message (the Double Ratchet). This demo stops at X3DH.
        </p>
      </div>
    ),
  }[id];

  return (
    <section className="border border-rule p-5 sm:p-6" aria-live="polite">
      <Label>step {state.step} of 10</Label>
      <h2 className="mt-2 text-(length:--text-title) text-ink">{step.title}</h2>
      <div className="mt-4 max-w-[62ch] leading-relaxed text-ink">{body}</div>
      {state.error && <p className="mt-3 text-sm text-ink">error: {state.error}</p>}
      {id !== 'chat' && (
        <div className="mt-6 flex items-center gap-4">
          <Button variant="primary" onClick={next} disabled={!canAdvance} loading={busy}>
            {NEXT_LABEL[id]}
          </Button>
          <span className="hidden text-xs text-muted sm:inline">or press the right arrow key</span>
        </div>
      )}
    </section>
  );
}

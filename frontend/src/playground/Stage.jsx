import { motion as Motion } from 'motion/react';
import { ArrowRight, CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { PROTOCOL_INFO, equalBytes } from '@e2ee/x3dh';
import { KeyChip, KeyName, KEY_INFO } from '../components/KeyChip.jsx';
import { Button, SectionLabel } from '../components/ui.jsx';
import { hex, cx } from '../lib/format.js';

const NEXT_LABEL = {
  intro: 'Generate everyone\'s keys',
  keys: 'Bob uploads his public keys',
  publish: 'Alice fetches Bob\'s bundle',
  fetch: 'Verify the signature',
  verify: 'Generate an ephemeral key',
  ephemeral: 'Compute the DHs',
  dh: 'Run HKDF',
  kdf: 'Encrypt & send',
  send: 'Bob comes online',
  receive: 'Start chatting',
};

/** One line of the DH table: DHn = DH(mine, theirs) → output. */
function DHRow({ step, index, match, owner }) {
  const [mk, mo] = step.mine.split('_');
  const [tk, to] = step.theirs.split('_');
  return (
    <Motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.35 }}
      className="rounded-xl border border-ink-700 bg-ink-900/60 p-3"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="w-10 font-mono font-semibold text-ink-200">{step.label}</span>
        <span className="text-ink-400">DH(</span>
        <KeyName kind={mk} owner={mo} />
        <span className="text-ink-500">private,</span>
        <KeyName kind={tk} owner={to} />
        <span className="text-ink-500">public</span>
        <span className="text-ink-400">)</span>
        <ArrowRight className="size-3.5 text-ink-500" />
        <code className="font-mono text-xs text-ink-100">{hex(step.out, { short: true, head: 10, tail: 6 })}</code>
        {match !== undefined && (
          match
            ? <CheckCircle2 className="size-4 text-bob" aria-label={`matches ${owner === 'B' ? 'Alice' : 'Bob'}`} />
            : <XCircle className="size-4 text-eve" aria-label="does not match" />
        )}
      </div>
      <p className="mt-1 pl-12 text-xs text-ink-400">{step.purpose}</p>
    </Motion.li>
  );
}

function IkmBar({ steps }) {
  const segments = [{ label: 'F', title: '32 × 0xFF', color: 'bg-ink-500' }, ...steps.map((s, i) => ({
    label: s.label,
    title: hex(s.out, { short: true }),
    color: ['bg-ik', 'bg-alice', 'bg-spk', 'bg-opk'][i],
  }))];
  return (
    <div>
      <div className="flex overflow-hidden rounded-lg border border-ink-600">
        {segments.map((s) => (
          <div key={s.label} className={cx('flex-1 py-1.5 text-center font-mono text-xs font-semibold text-ink-900', s.color)} title={s.title}>
            {s.label}
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-400">{segments.length * 32} bytes of input keying material</p>
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
          Alice wants to send Bob an end-to-end encrypted message. The catch: <strong>Bob is offline</strong>, and the only thing
          between them is a server that they don't trust. X3DH lets Alice derive a key that only Bob can also derive, without
          Bob being online and without the server learning anything.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {['IK', 'SPK', 'OPK', 'EK'].map((k) => (
            <div key={k} className="flex items-start gap-2 text-sm">
              <KeyName kind={k} className="w-10 shrink-0" />
              <span className="text-ink-300">{KEY_INFO[k].name}: {KEY_INFO[k].blurb}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-400">
          Every key below is real: X25519 / Ed25519 keys generated in your browser by the same code the live chat uses.
          Click any key to see its bytes.
        </p>
      </>
    ),
    keys: (
      <p>
        Each side generates a long-term <KeyName kind="IK" /> (identity key). Bob also generates a{' '}
        <KeyName kind="SPK" /> (signed prekey) and <strong>signs it with his identity key</strong>, plus a handful of{' '}
        <KeyName kind="OPK" />s (one-time prekeys). Private halves never leave the device; only public halves will be uploaded.
      </p>
    ),
    publish: (
      <p>
        Bob uploads his <strong>prekey bundle</strong>: the public <KeyName kind="IK" owner="B" />, <KeyName kind="SPK" owner="B" />,
        its signature, and his <KeyName kind="OPK" />s. Then he goes offline. That's the point of prekeys: they let someone start a
        conversation with Bob <em>asynchronously</em>. The server can see all of it, because it's all public.
      </p>
    ),
    fetch: (
      <>
        <p>
          Alice asks the server for Bob's bundle. The server hands her <strong>one</strong> one-time prekey and deletes it from its
          list, so no one else can ever get the same one.
        </p>
        {s.delivered?.oneTimePreKey ? (
          <p className="mt-2 text-sm text-ink-300">Alice got <KeyName kind="OPK" owner={`B${s.delivered.oneTimePreKey.label.slice(-1)}`} />.</p>
        ) : (
          <p className="mt-2 text-sm text-ik">No one-time prekeys left: this handshake will use 3 DHs instead of 4.</p>
        )}
      </>
    ),
    verify: s.verify?.ok ? (
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-6 shrink-0 text-bob" />
        <p>
          <code className="font-mono text-sm">Ed25519.verify(IK_B, SPK_B, sig)</code> is <strong className="text-bob">valid</strong>.
          Only the holder of Bob's identity key could have signed this prekey, so the server can't have substituted its own.
        </p>
      </div>
    ) : (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-6 shrink-0 text-eve" />
          <p>
            <strong className="text-eve">Signature check failed.</strong> The server swapped in its own signed prekey, hoping Alice
            would encrypt to a key it controls. It couldn't forge Bob's signature over it, so Alice <strong>aborts the handshake</strong> before
            computing anything.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={retryHonestly} disabled={busy}>
          Stop the attack and fetch again
        </Button>
      </div>
    ),
    ephemeral: (
      <p>
        Alice generates a fresh <KeyName kind="EK" owner="A" /> (ephemeral key) for this handshake only. She'll delete the private
        half the moment the shared secret is derived.
      </p>
    ),
    dh: s.handshake && (
      <>
        <p className="mb-3">
          Alice combines her two private keys with Bob's public keys in {s.handshake.trace.steps.length} Diffie-Hellman operations. Each one contributes a
          different guarantee:
        </p>
        <ol className="space-y-2">
          {s.handshake.trace.steps.map((st, i) => <DHRow key={st.label} step={st} index={i} />)}
        </ol>
      </>
    ),
    kdf: s.handshake && (
      <div className="space-y-4">
        <p>The DH outputs are concatenated, prefixed with 32 bytes of 0xFF, and fed through HKDF-SHA256:</p>
        <IkmBar steps={s.handshake.trace.steps} />
        <div className="rounded-xl border border-ink-600 bg-ink-900/70 p-3 font-mono text-xs leading-relaxed text-ink-300">
          SK = HKDF(salt = 0×32, ikm, info = "{PROTOCOL_INFO}")
          <p className="mt-2 break-all text-sm text-sk">{hex(s.handshake.sharedKey)}</p>
        </div>
        <p className="text-sm text-ink-400">
          Alice now deletes <KeyName kind="EK" owner="A" /> and the DH outputs. Even if her identity key leaks tomorrow, this session can't be recomputed.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-200">Alice's first message to Bob</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            className="h-10 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-sm focus:border-alice focus:outline-none"
          />
        </label>
      </div>
    ),
    send: s.server.initial && (
      <div className="space-y-3">
        <p>
          Alice encrypts with AES-256-GCM under SK, using <span className="font-mono text-sm">AD = IK_A ‖ IK_B</span> as associated data so the
          ciphertext is bound to both identities. She sends a header so Bob can redo the math:
        </p>
        <div className="grid gap-1.5 sm:grid-cols-3">
          <KeyChip kind="IK" owner="A" value={s.server.initial.senderIdentityKey} />
          <KeyChip kind="EK" owner="A" value={s.server.initial.ephemeralKey} />
          <div className="rounded-lg border border-opk/40 bg-opk/10 px-2.5 py-1.5 text-sm">
            <span className="font-mono font-semibold text-opk">OPK id</span>{' '}
            <span className="font-mono text-xs text-ink-300">{s.server.initial.oneTimePreKeyLabel ?? 'none'}</span>
          </div>
        </div>
        <p className="break-all rounded-xl border border-ink-700 bg-ink-900/70 p-3 font-mono text-xs text-ink-300">
          <span className="text-ink-500">ciphertext </span>{s.server.initial.ciphertext}
        </p>
        <p className="text-sm text-ink-400">Bob is still offline, so the server stores it. It can't read it.</p>
      </div>
    ),
    receive: s.received && (
      <div className="space-y-3">
        <p>
          Bob comes online, fetches the initial message and performs the <strong>mirror-image</strong> DHs with his private keys and
          Alice's public ones. Diffie-Hellman is symmetric, so every output matches:
        </p>
        <ol className="space-y-2">
          {s.received.trace.steps.map((st, i) => (
            <DHRow key={st.label} step={st} index={i} owner="B" match={equalBytes(st.out, s.handshake.trace.steps[i].out)} />
          ))}
        </ol>
        <div className={cx('flex items-start gap-3 rounded-xl border p-3', s.received.match ? 'border-bob/40 bg-bob/10' : 'border-eve/40 bg-eve/10')}>
          {s.received.match ? <CheckCircle2 className="size-5 shrink-0 text-bob" /> : <XCircle className="size-5 shrink-0 text-eve" />}
          <div className="text-sm">
            <p className="font-medium">{s.received.match ? 'Same 256-bit secret on both sides, and it never crossed the network.' : 'Keys differ.'}</p>
            {s.received.plaintext && <p className="mt-1 text-ink-300">Bob decrypts: “{s.received.plaintext}”</p>}
            <p className="mt-1 text-ink-400">Bob deletes the one-time prekey's private half, so this message can't be replayed into a new session.</p>
          </div>
        </div>
      </div>
    ),
    chat: (
      <div className="space-y-3">
        <p>
          The handshake is done. Type as Alice or Bob: each message is encrypted with SK and a fresh random nonce. Watch the wire
          log: the server only ever relays ciphertext.
        </p>
        <p className="text-sm text-ink-400">
          Turn on <strong className="text-eve">“Flip one bit…”</strong> in the server panel to see AES-GCM reject a tampered message.
        </p>
        <p className="text-sm text-ink-400">
          <strong className="text-ink-200">What a real messenger adds next:</strong> Signal feeds SK into the Double Ratchet, which
          derives a new key for every message. Then even a key stolen mid-conversation can't decrypt past or future messages.
          This demo stops at X3DH.
        </p>
      </div>
    ),
  }[id];

  return (
    <section className="card p-5 sm:p-6" aria-live="polite">
      <SectionLabel>Step {state.step} of 10</SectionLabel>
      <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{step.title}</h2>
      <div className="mt-3 leading-relaxed text-ink-200">{body}</div>
      {state.error && <p className="mt-3 text-sm text-eve">{state.error}</p>}
      {id !== 'chat' && (
        <div className="mt-6 flex items-center gap-3">
          <Button variant="primary" onClick={next} disabled={!canAdvance} loading={busy}>
            {NEXT_LABEL[id]} <ArrowRight className="size-4" />
          </Button>
          <span className="hidden text-xs text-ink-500 sm:inline">or press →</span>
        </div>
      )}
    </section>
  );
}

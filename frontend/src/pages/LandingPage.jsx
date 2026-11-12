import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as x3dh from '@e2ee/x3dh';
import { Button, Label } from '../components/ui.jsx';
import { REPO_URL } from '../components/SiteHeader.jsx';
import { GlyphLock } from '../components/GlyphLock.jsx';
import { hex, cx } from '../lib/format.js';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Runs a real X3DH handshake between two fresh identities, in this browser. */
async function runHandshake() {
  const alice = x3dh.generateIdentityKeyPair();
  const bob = x3dh.generateIdentityKeyPair();
  const spk = x3dh.generateSignedPreKey(bob);
  const [opk] = x3dh.generateOneTimePreKeys(1);
  const bundle = {
    identityKey: bob.publicKey,
    edIdentityKey: bob.edPublicKey,
    signedPreKey: spk.publicKey,
    signedPreKeySignature: spk.signature,
    oneTimePreKey: { id: opk.id, publicKey: opk.publicKey },
  };
  const sent = await x3dh.x3dhInitiate({ identity: alice, bundle });
  const got = await x3dh.x3dhRespond({
    identity: bob,
    signedPreKeySecret: spk.secretKey,
    oneTimePreKeySecret: opk.secretKey,
    senderIdentityKey: alice.publicKey,
    ephemeralKey: sent.ephemeralPublicKey,
  });
  const a = hex(sent.sharedKey, { short: true, head: 8, tail: 6 });
  const b = hex(got.sharedKey, { short: true, head: 8, tail: 6 });
  return [
    { prompt: 'alice', text: 'x3dh send --to bob' },
    { step: 'fetch', text: 'bob’s public keys', result: 'ok' },
    { step: 'check', text: 'signature on SPK_B', result: 'ok' },
    { step: 'dh', text: '4 steps with bob’s keys', result: 'ok' },
    { step: 'key', text: a, key: true },
    { prompt: 'bob', text: 'x3dh receive --from alice' },
    { step: 'dh', text: 'same 4 steps, his side', result: 'ok' },
    { step: 'key', text: b, key: true, result: x3dh.equalBytes(sent.sharedKey, got.sharedKey) ? 'same' : 'different' },
  ];
}

// Same shape as the real output, so the box is the right size before it fills.
const PLACEHOLDER = [
  { prompt: "alice", text: "x3dh send --to bob" },
  { step: "fetch", text: "-", result: "ok" },
  { step: "check", text: "-", result: "ok" },
  { step: "dh", text: "-", result: "ok" },
  { step: "key", text: "-" },
  { prompt: "bob", text: "x3dh receive --from alice" },
  { step: "dh", text: "-", result: "ok" },
  { step: "key", text: "-", result: "same" },
];

function Session() {
  const [lines, setLines] = useState([]);
  const [shown, setShown] = useState(0);

  const run = useCallback(async () => {
    const next = await runHandshake();
    setLines(next);
    setShown(prefersReducedMotion() ? next.length : 0);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  useEffect(() => {
    if (shown >= lines.length) return undefined;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 400 : 260);
    return () => clearTimeout(t);
  }, [shown, lines.length]);

  const done = lines.length > 0 && shown >= lines.length;

  return (
    <figure className="well text-left">
      <div className="px-4 py-4 text-sm sm:px-5" aria-live="polite">
        {(lines.length ? lines : PLACEHOLDER).map((l, i) => {
          const visible = lines.length > 0 && i < shown;
          const caretHere = !done && i === Math.min(shown, (lines.length || PLACEHOLDER.length) - 1) && !visible;
          return (
            <p key={i} className={cx("relative", l.prompt ? i > 0 && "mt-3" : "grid grid-cols-[3.75rem_minmax(0,1fr)_auto] gap-2")}>
              {caretHere && <span className="caret absolute top-1 left-0" aria-hidden />}
              <span className={cx("contents", visible ? "type-in" : "[&>*]:invisible")}>
                {l.prompt ? (
                  <>
                    <span className="text-muted">{l.prompt} ~ $ </span>
                    <span className="text-ink">{l.text}</span>
                  </>
                ) : (
                  <>
                    <span className="text-muted">{l.step}</span>
                    <span className={l.key ? "truncate text-accent" : "truncate text-ink-2"}>{l.text}</span>
                    <span className="text-accent">{l.result}</span>
                  </>
                )}
              </span>
            </p>
          );
        })}
      </div>
      <figcaption className="flex items-center justify-between gap-4 border-t border-rule px-4 py-2 text-xs text-muted sm:px-5">
        <span>Real keys, made just now in your browser.</span>
        <button onClick={run} disabled={!done} className="stepped shrink-0 whitespace-nowrap px-2 py-1 text-ink-2 hover:bg-paper-3 hover:text-ink active:bg-accent-wash disabled:opacity-40">
          run again
        </button>
      </figcaption>
    </figure>
  );
}

const SAY = ['are we still on for tonight?', 'yes, 7pm at the usual place'];

/** Plaintext on one side, real ciphertext on the other, as a diff. */
function ServerDiff() {
  const [stored, setStored] = useState(null);
  useEffect(() => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const ad = crypto.getRandomValues(new Uint8Array(64));
    Promise.all(SAY.map((s) => x3dh.encrypt(key, s, ad))).then((out) => setStored(out.map((o) => o.ciphertext)));
  }, []);
  const rows = [...SAY.map((t) => ['-', t]), ...(stored ?? SAY.map(() => '…')).map((t) => ['+', t])];
  return (
    <figure className="border border-rule">
      <figcaption className="grid grid-cols-2 border-b border-rule-2 px-4 py-2 text-xs text-muted">
        <span>--- a/what-you-type</span>
        <span>+++ b/what-the-server-stores</span>
      </figcaption>
      <ol className="py-2 text-sm sm:text-base">
        {rows.map(([sign, text], i) => (
          <li key={i} className={cx('grid grid-cols-[2.5rem_1.5rem_minmax(0,1fr)] py-1.5 pr-4', sign === '+' ? 'bg-accent-wash text-ink' : 'text-muted')}>
            <span className="text-right text-xs leading-6 text-rule-2">{i + 1}</span>
            <span className={cx('text-center', sign === '+' && 'text-accent')}>{sign}</span>
            <span className="break-all">{text}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const SCREENS = [
  { id: 'steps', tab: 'step through it', src: '/captures/playground.webp', w: 3200, h: 1360, alt: 'The playground at the four DH steps: Alice on the left, the server in the middle, Bob on the right.', caption: 'Each step shows the real keys and what they produce.' },
  { id: 'attack', tab: 'try to break it', src: '/captures/attack.webp', w: 3200, h: 1512, alt: 'The playground after the server swapped Bob’s signed prekey: the signature check fails.', caption: 'Swap a key or flip a bit. The protocol catches it.' },
  { id: 'inspect', tab: 'inspect a chat', src: '/captures/inspect.webp', w: 3200, h: 1280, alt: 'The live chat with the inspect panel open, listing the DH outputs and the safety number.', caption: 'Every live chat shows how its key was made.' },
];

function Screens() {
  const [active, setActive] = useState(SCREENS[0].id);
  return (
    <div>
      <div className="scroll-thin flex overflow-x-auto border border-b-0 border-rule" role="tablist" aria-label="Screens">
        {SCREENS.map((s) => (
          <button
            key={s.id}
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`panel-${s.id}`}
            onClick={() => setActive(s.id)}
            className={cx('stepped shrink-0 border-r border-rule px-4 py-2.5 text-sm whitespace-nowrap active:bg-accent-wash', active === s.id ? 'bg-accent-wash text-ink' : 'text-ink-2 hover:bg-paper-3 hover:text-ink')}
          >
            {s.tab}
          </button>
        ))}
      </div>
      {SCREENS.map((s) => (
        <figure key={s.id} id={`panel-${s.id}`} role="tabpanel" aria-labelledby={`tab-${s.id}`} hidden={active !== s.id} className="border border-rule">
          <div className="scroll-thin overflow-x-auto">
            <img src={s.src} alt={s.alt} width={s.w} height={s.h} loading="lazy" className="w-full min-w-[44rem] sm:min-w-0" />
          </div>
          <figcaption className="border-t border-rule px-4 py-2.5 text-sm text-ink-2">{s.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}

const FIGURES = [
  ['4', 'Diffie-Hellman steps'],
  ['32', 'bytes in the shared key'],
  ['100', 'one-time prekeys per account'],
  ['600,000', 'hash rounds guarding your keys'],
];

const LIMITS = [
  ['no ratchet', 'One key per chat. Signal changes it with every message.'],
  ['one browser', 'Your keys live where you signed up. No backup.'],
  ['trust on first use', 'Compare safety numbers to be sure.'],
  ['the bot', 'Its keys live on the server. Fine for a bot, never for a person.'],
  ['metadata', 'The server still sees who talks to whom, and when.'],
];

function Actions({ className }) {
  return (
    <div className={cx('flex flex-wrap gap-3', className)}>
      <Button as={Link} to="/playground" variant="primary" size="lg">Open the playground</Button>
      <Button as={Link} to="/chat" size="lg">Chat with the bot</Button>
    </div>
  );
}

export default function LandingPage() {
  useEffect(() => {
    document.title = 'x3dh: two strangers, one secret key';
  }, []);

  return (
    <>
      <section className="wrap grid min-h-[calc(100dvh-3rem)] place-items-center py-14">
        <div className="w-full max-w-[44rem] text-center">
          <h1 className="mx-auto">Two strangers. One secret key.</h1>
          <p className="lead mx-auto mt-5 text-ink-2">Watch Signal’s handshake run, step by step, in your browser.</p>
          <Actions className="mt-8 justify-center" />
          <div className="mt-10">
            <Session />
          </div>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="wrap grid items-center gap-12 py-(--section-gap-s) lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <GlyphLock className="mx-auto w-full max-w-[30rem]" />
          <div>
            <h2>What the server stores.</h2>
            <p className="mt-4 max-w-[52ch] text-ink-2">Messages leave your browser already encrypted. The server can’t read them, and neither can anyone who breaks into it.</p>
            <div className="mt-8">
              <ServerDiff />
            </div>
            <p className="mt-4 text-sm text-muted">The padlock is drawn with the characters of a real encrypted message, made just now.</p>
          </div>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="wrap py-(--section-gap-s)">
          <h2>Step through the handshake.</h2>
          <p className="mt-4 max-w-[52ch] text-ink-2">The playground runs Alice, the server and Bob side by side.</p>
          <div className="mt-10">
            <Screens />
          </div>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="wrap py-(--section-gap-s)">
          <Label>x3dh --stats</Label>
          <dl className="mt-6 grid grid-cols-2 border-y border-rule lg:grid-cols-4">
            {FIGURES.map(([n, label]) => (
              <div key={label} className="flex min-w-0 flex-col-reverse justify-end border-rule px-4 py-6 odd:border-r lg:border-r lg:last:border-r-0">
                <dt className="mt-3 text-sm text-muted"># {label}</dt>
                <dd className="figure wide text-[clamp(2rem,2.4vw+0.75rem,3.25rem)] leading-none font-normal text-ink">{n}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="wrap grid gap-10 py-(--section-gap-s) lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <h2>What it doesn’t do.</h2>
            <p className="mt-4 text-ink-2">It’s a learning project, not Signal. Here’s what it leaves out.</p>
          </div>
          <dl className="border-t border-rule">
            {LIMITS.map(([term, desc]) => (
              <div key={term} className="grid gap-1 border-b border-rule py-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6">
                <dt className="text-accent">{term}</dt>
                <dd className="text-ink-2">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="wrap grid items-center gap-10 py-(--section-gap-s) lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <h2>Say hi to x3dh-bot.</h2>
            <p className="mt-4 text-ink-2">No account for the playground. For the live chat, sign up and say hi to x3dh-bot.</p>
            <Actions className="mt-8" />
            <p className="mt-6 text-sm text-muted">
              Read the <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-ink-2 decoration-dotted hover:text-accent">source</a>.
            </p>
          </div>
          <figure className="border border-rule">
            <img src="/captures/chat.webp" alt="A live chat with x3dh-bot: it decrypts the message and replies." width="3200" height="1280" loading="lazy" className="w-full" />
            <figcaption className="border-t border-rule px-4 py-2.5 text-sm text-ink-2">x3dh-bot reads your message and proves it.</figcaption>
          </figure>
        </div>
      </section>
    </>
  );
}

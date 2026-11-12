import { Link } from 'react-router-dom';
import { motion as Motion } from 'motion/react';
import { ArrowRight, Bot, Eye, FlaskConical, Lock, Server, ShieldCheck, TriangleAlert } from 'lucide-react';
import { KeyName } from '../components/KeyChip.jsx';
import { Button, SectionLabel } from '../components/ui.jsx';
import { REPO_URL } from '../components/SiteHeader.jsx';

function HeroDiagram() {
  const fade = (delay) => ({ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.5 } });
  return (
    <div className="card relative overflow-hidden p-5 sm:p-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        <Motion.div {...fade(0.1)} className="space-y-2">
          <p className="font-semibold text-alice">Alice</p>
          <div className="flex flex-wrap gap-1.5 text-sm">
            <KeyName kind="IK" owner="A" /> <KeyName kind="EK" owner="A" />
          </div>
        </Motion.div>
        <Motion.div {...fade(0.3)} className="flex flex-col items-center gap-1 text-server">
          <Server className="size-6" />
          <span className="text-xs text-ink-400">untrusted</span>
        </Motion.div>
        <Motion.div {...fade(0.5)} className="space-y-2 text-right">
          <p className="font-semibold text-bob">Bob <span className="text-xs font-normal text-ink-500">(offline)</span></p>
          <div className="flex flex-wrap justify-end gap-1.5 text-sm">
            <KeyName kind="IK" owner="B" /> <KeyName kind="SPK" owner="B" /> <KeyName kind="OPK" owner="B" />
          </div>
        </Motion.div>
      </div>

      <Motion.div {...fade(0.8)} className="mt-6 space-y-1.5 font-mono text-xs sm:text-sm">
        {[
          ['DH1', 'IK', 'A', 'SPK', 'B'],
          ['DH2', 'EK', 'A', 'IK', 'B'],
          ['DH3', 'EK', 'A', 'SPK', 'B'],
          ['DH4', 'EK', 'A', 'OPK', 'B'],
        ].map(([l, a, ao, b, bo], i) => (
          <Motion.p key={l} {...fade(1 + i * 0.2)} className="flex items-center gap-2">
            <span className="w-9 text-ink-400">{l}</span>
            <span className="text-ink-500">DH(</span>
            <KeyName kind={a} owner={ao} />, <KeyName kind={b} owner={bo} />
            <span className="text-ink-500">)</span>
          </Motion.p>
        ))}
      </Motion.div>

      <Motion.div {...fade(2)} className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-900/70 px-4 py-3">
        <span className="font-mono text-sm text-alice">SK</span>
        <span className="h-px flex-1 border-t border-dashed border-ink-500" />
        <span className="text-center text-xs text-ink-300">same 256-bit key,<br />never transmitted</span>
        <span className="h-px flex-1 border-t border-dashed border-ink-500" />
        <span className="font-mono text-sm text-bob">SK</span>
      </Motion.div>
    </div>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'Bob publishes prekeys',
    body: <>Bob uploads his <KeyName kind="IK" />, a <KeyName kind="SPK" /> signed by it, and a stack of <KeyName kind="OPK" />s. Then he can go offline.</>,
  },
  {
    n: '02',
    title: 'Alice fetches and verifies',
    body: <>The server hands Alice one <KeyName kind="OPK" /> and deletes it. Alice checks Bob's signature on <KeyName kind="SPK" />, so the server can't swap it.</>,
  },
  {
    n: '03',
    title: 'Four Diffie-Hellmans',
    body: <>Alice mixes her <KeyName kind="IK" /> and a fresh <KeyName kind="EK" /> with Bob's keys. Each DH adds authentication, forward secrecy or replay protection.</>,
  },
  {
    n: '04',
    title: 'Same key, both sides',
    body: <>HKDF turns the DH outputs into <KeyName kind="SK" />. Bob does the mirror-image DHs later and gets the identical key.</>,
  },
];

export default function LandingPage() {
  return (
    <div>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24 lg:pb-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-3 py-1 text-xs text-ink-300">
            <span className="size-1.5 rounded-full bg-bob" /> Signal's X3DH, implemented from scratch
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            End-to-end encryption, <span className="bg-gradient-to-r from-alice to-bob bg-clip-text text-transparent">explained by running it.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-pretty text-ink-300">
            How do two people agree on a secret key when one of them is offline and the server between them can't be trusted?
            Step through the X3DH handshake with real keys, try to break it, then chat over it for real.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button as={Link} to="/playground" variant="primary" size="lg">
              <FlaskConical className="size-4.5" /> Open the playground
            </Button>
            <Button as={Link} to="/chat" size="lg">
              <Bot className="size-4.5" /> Chat with x3dh-bot
            </Button>
          </div>
          <p className="mt-4 text-sm text-ink-500">The playground needs no account. Everything runs in your browser.</p>
        </div>
        <HeroDiagram />
      </section>

      <section className="border-y border-ink-700/60 bg-ink-950/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <SectionLabel>How X3DH works</SectionLabel>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Four steps, one shared secret</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="card p-5">
                <p className="font-mono text-sm text-ink-500">{s.n}</p>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{s.body}</p>
              </div>
            ))}
          </div>
          <Link to="/playground" className="mt-8 inline-flex items-center gap-1.5 text-alice hover:underline">
            See each step with real keys <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SectionLabel>The point of E2EE</SectionLabel>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">What you see vs. what the server sees</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-bob"><Lock className="size-4" /> On your screen</p>
            <div className="mt-4 space-y-2">
              <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-alice/90 px-3.5 py-2 text-sm text-ink-900">are we still on for tonight?</p>
              <p className="w-fit max-w-[80%] rounded-2xl rounded-bl-md border border-ink-600 bg-ink-800 px-3.5 py-2 text-sm">yes! 7pm, usual place 🍜</p>
            </div>
          </div>
          <div className="card p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-ik"><Eye className="size-4" /> In the server's database</p>
            <div className="mt-4 space-y-2 font-mono text-[11px] leading-relaxed break-all text-ink-300">
              <p className="rounded-xl border border-dashed border-ink-600 p-2.5">ct: 3q5Pz0mJ9wR8vH+eYk2Lw1o7Xa4dQnT6bsU0cFh2iGgVrM9e==</p>
              <p className="rounded-xl border border-dashed border-ink-600 p-2.5">ct: oQ8Wn1sZ4yE+0aR3jKf7Dp5LxUc2Mh9tbV6iNw==</p>
            </div>
            <p className="mt-3 text-xs text-ink-400">It still sees who talks to whom, when, and how much. E2EE hides content, not metadata.</p>
          </div>
        </div>
      </section>

      <section className="border-t border-ink-700/60 bg-ink-950/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionLabel>Under the hood</SectionLabel>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Implementation notes</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink-300">
              {[
                'X25519 for Diffie-Hellman, Ed25519 identity keys (converted to X25519 for DH) to sign prekeys.',
                'KDF per the spec: HKDF-SHA256 over 0xFF×32 ‖ DH1 ‖ DH2 ‖ DH3 ‖ DH4, zero salt, app-specific info string.',
                'AES-256-GCM with associated data IK_A ‖ IK_B, so ciphertexts are bound to both identities.',
                'The server hands out each one-time prekey once and deletes it, and refuses bundles whose signature doesn\'t verify.',
                'Private keys never leave the browser. At rest they\'re AES-GCM encrypted under a PBKDF2 (600k) password key, held as a non-extractable WebCrypto key while you\'re logged in.',
                'One protocol module is shared by the web client, this playground and the server-side bot, and it\'s covered by unit and end-to-end API tests.',
              ].map((t) => (
                <li key={t} className="flex gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-bob" />{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <SectionLabel>Being honest</SectionLabel>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">What this demo doesn't do</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink-300">
              {[
                'No Double Ratchet: one key per session, not per message. Signal ratchets after X3DH.',
                'Single device per account, and no key backup: your keys live in the browser you signed up in.',
                'Identity keys are trusted on first use. Compare safety numbers to detect a malicious server.',
                'x3dh-bot is a client that runs on the server, so its private keys live there. Fine for a bot, never for a person.',
                'It\'s a learning project: not audited, and a public demo whose messages expire after 7 days.',
              ].map((t) => (
                <li key={t} className="flex gap-2.5"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-ik" />{t}</li>
              ))}
            </ul>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-alice hover:underline">
              Read the source <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

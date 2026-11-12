# X3DH, explained by running it

An end-to-end encrypted messenger built on Signal's [X3DH key agreement](https://signal.org/docs/specifications/x3dh/),
with an interactive visualizer that walks through the handshake step by step, using real keys.

## How this was built

I built the original messenger in 2025 as a university security project: the X3DH
key agreement, key generation and storage, and the session flow.

In 2026 I revamped it with an AI coding assistant (Claude). It helped me redesign
the frontend, add the interactive playground and demo bot, fix security issues in
the backend, align the key derivation with the X3DH spec, write tests, and set up
deployment. The git history shows exactly what changed.

- **Playground** (`/playground`): Alice, an untrusted server and Bob, all simulated in your browser. Step through
  key generation, bundle publishing, signature verification, the four Diffie-Hellmans and HKDF. Then try to break it:
  have the server swap Bob's signed prekey, run out of one-time prekeys, or flip bits in transit.
- **Live chat** (`/chat`): the real thing. Sign up, and your browser generates your keys; open a chat, and it runs X3DH
  against the other person's published bundle. A **Server's view** toggle shows messages exactly as stored, and the
  **Protocol inspector** shows that conversation's DH outputs and safety number.
- **x3dh-bot**: always there to talk to, so the live chat works even when nobody else is online. It's a genuine X3DH
  client that completes the handshake, decrypts your messages and replies encrypted.

## How it works

```
Bob (offline)            Server (untrusted)              Alice
IK_B, SPK_B, Sig, OPK_B ─► stores bundle
                           hands out 1 OPK, deletes it ─► verify Sig(IK_B, SPK_B)
                                                          EK_A ← fresh
                                                          DH1 = DH(IK_A, SPK_B)
                                                          DH2 = DH(EK_A, IK_B)
                                                          DH3 = DH(EK_A, SPK_B)
                                                          DH4 = DH(EK_A, OPK_B)
                                                          SK  = HKDF(0xFF×32 ‖ DH1‖DH2‖DH3‖DH4)
                         ◄─ IK_A, EK_A, OPK id, AES-GCM(SK, msg, AD = IK_A‖IK_B)
Bob: same four DHs from his side → same SK → decrypts, deletes OPK_B
```

| | |
|---|---|
| Curves | X25519 for DH; Ed25519 identity keys (converted with `ed2curve`) sign the prekey |
| KDF | HKDF-SHA256, `F = 0xFF×32` prefix, zero salt, app-specific info (spec §2.2) |
| AEAD | AES-256-GCM, 96-bit random nonce, `AD = IK_A ‖ IK_B` |
| One-time prekeys | Popped atomically by the server when a bundle is fetched; client deletes the secret after use |
| Signed prekeys | Verified by the client *and* the server; rotated weekly; old ones kept briefly so in-flight handshakes still work |
| Key storage | Private keys never leave the browser. At rest: AES-GCM under PBKDF2-SHA256 (600k) of your password. While logged in: a non-extractable WebCrypto key in IndexedDB |
| Safety numbers | 60-digit code from both identity keys, to detect a server that swaps keys |

`shared/x3dh.js` is the single protocol implementation used by the browser client, the playground and the bot.

### Honest limitations

No Double Ratchet (one key per session, not per message) · one device per account, no key backup · identity keys
are trust-on-first-use · the bot's keys live on the server (fine for a bot, never for a person) · the server still
sees metadata · the key-vault password is the login password, so the server sees it at login (a real app would
derive separate auth and vault secrets) · sessions are stateless JWTs that can't be revoked server-side before they
expire · not audited.

## Project layout

```
shared/     X3DH, HKDF, AES-GCM, safety numbers  (+ unit tests)
backend/    Express + Socket.io + MongoDB; stores only public keys & ciphertext; x3dh-bot  (+ API tests)
frontend/   React + Vite + Tailwind; playground engine, key vault, live chat  (+ unit tests)
```

## Running locally

Requires Node 20+ and MongoDB (Docker is easiest).

```bash
docker run -d --name e2ee-mongo -p 27017:27017 mongo:7
npm install
cp backend/.env.example backend/.env      # defaults point at the local Mongo
npm run dev:backend                       # http://localhost:5001
npm run dev:frontend                      # http://localhost:5173 (proxies /api and /socket.io)
```

Tests (the API tests need the Mongo above):

```bash
npm test        # shared + backend + frontend
npm run lint
```

## Deploying

The app ships as a single container: the backend serves the built frontend from the same origin.

**Render (free tier):** create a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster, then in Render choose
*New → Blueprint*, select this repo, and paste the Atlas connection string as `MONGODB_URI`. `render.yaml` takes care
of the rest (a generated `JWT_SECRET`, `NODE_ENV=production`, health check).

**Anywhere else with Docker:**

```bash
docker build -t x3dh-chat .
docker run -p 8080:8080 -e MONGODB_URI=... -e JWT_SECRET=$(openssl rand -hex 32) x3dh-chat
```

Set `TRUST_PROXY=1` when running behind a reverse proxy so rate limiting sees real client IPs. Demo messages expire
after 7 days (`MESSAGE_TTL_SECONDS`).

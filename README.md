# E2EE Messenger

A proof-of-concept end-to-end encrypted chat built with React, Express, MongoDB and the X3DH handshake.
Simple chatting platform, where every user can be seen and talked to both real time and asynchronously

## Features

- **User Authentication**  
  - Sign-up and login flows via JWT/session cookie  
  - Secure logout

- **Key Management & X3DH Handshake**  
  - Ed25519 identity keypair → converted to X25519 for encryption  
  - Signed Pre-Key (rotated on login)  
  - 100 One-Time Pre-Keys generated at signup (and replenished when low)  
  - Full X3DH four-DH handshake to establish a shared secret  

- **Private-Key Storage**  
  - Password-derived AES-GCM encryption (PBKDF2 → 100 k iterations) of all secret key material  
  - Encrypted blob stored in IndexedDB/localStorage  
  - Decrypt on login, re-encrypt on logout or key-rotation  

- **Real-Time Messaging**  
  - Socket.io for live, bi-directional message delivery  
  - Per-conversation session management: create, end, auto-clean  

- **Session Lifecycle**  
  - Create new “session” when initiating chat  
  - Track sender/receiver active flags in MongoDB  
  - End session API → tears down DB record when both sides end  

- **Frontend**  
  - React + Vite + Tailwind + DaisyUI  
  - Zustand stores for Auth & Session state  

- **Backend**  
  - Node.js + Express + Mongoose  
  - `/auth` routes for signup/login/logout  
  - `/session` routes for handshake, message exchange, endSession  

## Tech Stack

- Front-end: React, Vite, Tailwind CSS, DaisyUI, Zustand, Socket.io-client  
- Back-end: Node.js, Express, Mongoose (MongoDB), Socket.io-server  
- Crypto: TweetNaCl (Ed25519/X25519), WebCrypto (PBKDF2, AES-GCM), ed2curve, nanoid  

---

## Getting Started

### Prerequisites

- Node.js ≥ 18  
- MongoDB running locally on `mongodb://localhost:27017`  
- yarn or npm  

### Clone & Install

bash
git clone https://github.com/your-org/6841-project-e2ee-messenger.git
cd 6841-project-e2ee-messenger

### Backend
cd backend
cp .env.example .env                # set MONGODB_URI, JWT_SECRET, etc.
npm install                         # or yarn install
npm run dev                         # starts Express on http://localhost:5001

### Frontend
cd frontend
cp .env.example .env                # set VITE_API_URL=/api
npm install                         # or yarn install
npm run dev                         # starts Vite on http://localhost:5173

### Usage
Open http://localhost:5173
Sign up with a username & password (this generates your key-bundle)
Log in (decrypts your keys + connects Socket.io)
Start a conversation—your browser performs the X3DH handshake and you can send/receive messages in real-time.
Logout to securely re-encrypt keys under your password.

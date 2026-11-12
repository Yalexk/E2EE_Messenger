import { createApp } from './app.js';
import { connectDB } from './lib/db.js';
import { ensureBot } from './bot/bot.js';

for (const name of ['MONGODB_URI', 'JWT_SECRET']) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable ${name}. See backend/.env.example.`);
    process.exit(1);
  }
}
if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET.length < 32 || /change-me/i.test(process.env.JWT_SECRET))) {
  console.error('JWT_SECRET must be a random value of at least 32 characters in production (e.g. `openssl rand -hex 32`).');
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 5001);

await connectDB();
await ensureBot();

const { server } = createApp();
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

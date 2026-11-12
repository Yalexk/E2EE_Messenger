import mongoose from 'mongoose';

/**
 * The demo bot is an ordinary X3DH client that happens to run on the server.
 * Its private keys therefore live here. That is fine for a demo bot and is
 * exactly what you must never do for a real person.
 */
const botStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'bot' },
  identity: { edPublicKey: String, edSecretKey: String, publicKey: String, secretKey: String },
  signedPreKey: { id: String, publicKey: String, secretKey: String, signature: String },
  oneTimePreKeys: { type: [{ _id: false, id: String, secretKey: String }], default: [] },
});

const botSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sharedKey: { type: String, required: true },
    associatedData: { type: String, required: true },
    userIdentityKey: { type: String, required: true },
    usedOneTimePreKey: { type: Boolean, default: false },
    lastCiphertext: { type: String },
    lastNonce: { type: String },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
botSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export const BotState = mongoose.model('BotState', botStateSchema);
export const BotSession = mongoose.model('BotSession', botSessionSchema);

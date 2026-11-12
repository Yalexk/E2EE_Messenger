import mongoose from 'mongoose';

/**
 * Everything the server stores about a message. Note what is *not* here:
 * no plaintext, no shared key. `messageText` is AES-GCM ciphertext.
 */
const messageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true },
    messageText: { type: String, required: true }, // base64 ciphertext
    nonce: { type: String, required: true }, // base64 96-bit GCM nonce

    // X3DH "initial message" header (only on the first message of a session)
    isInitialMessage: { type: Boolean, default: false },
    senderIdentityKey: { type: String },
    ephemeralKeyPublic: { type: String },
    signedPreKeyId: { type: String },
    otkKeyId: { type: String, default: null },
    sessionInfo: {
      senderSessionActive: { type: Boolean, default: true },
      receiverHasReceived: { type: Boolean, default: false },
      receiverSessionActive: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: 1 });

// Public demo: messages expire automatically (default 7 days).
const ttl = Number(process.env.MESSAGE_TTL_SECONDS ?? 7 * 24 * 3600);
if (ttl > 0) messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttl });

const Message = mongoose.model('Message', messageSchema);
export default Message;

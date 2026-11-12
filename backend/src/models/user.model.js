import mongoose from 'mongoose';

/**
 * A user and their *public* prekey bundle. The server never sees a private key.
 */
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    password: { type: String, required: true },

    // Long-term identity key: X25519 form (for DH) and Ed25519 form (for signatures)
    identityKey: { type: String, required: true },
    edIdentityKey: { type: String, required: true },

    // Medium-term signed prekey
    signedPreKeyId: { type: String, required: true },
    signedPreKey: { type: String, required: true },
    signedPreKeySignature: { type: String, required: true },
    signedPreKeyUpdatedAt: { type: Date, default: Date.now },

    // Single-use prekeys: one is removed every time someone fetches this bundle
    oneTimePreKeys: {
      type: [{ _id: false, id: { type: String, required: true }, publicKey: { type: String, required: true } }],
      default: [],
    },

    isBot: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Usernames are unique case-insensitively ("Alice" and "alice" can't both exist).
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 }, name: 'username_ci' });

/** Fields that are safe to show any other user. */
export function publicUser(user) {
  return {
    _id: user._id,
    username: user.username,
    identityKey: user.identityKey,
    edIdentityKey: user.edIdentityKey,
    isBot: !!user.isBot,
    createdAt: user.createdAt,
  };
}

const User = mongoose.model('User', userSchema);
export default User;

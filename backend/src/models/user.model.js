import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        username: {
        type: String,
        required: true,
        unique: true,
        },
        password: {
        type: String,
        required: true,
        minlength: 6,
        },
        createdAt: {
        type: Date,
        default: Date.now,
        },
        identityKey: {
        type: String,
        required: true,
        },
        edIdentityKey: {
        type: String,
        required: true,
        },
        signedPreKey: {
        type: String,
        required: true,
        },
        signedPreKeySignature: {
        type: String,
        required: true,
        },
        oneTimePreKeys: [{
        type: String,
        required: true,
        }],
    },
    {
        timestamps: true,
    }
);

const User = mongoose.model("User", userSchema);

export default User;

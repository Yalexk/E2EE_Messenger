import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
    {
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        messageText: {
            type: String,
        },
        isInitialMessage: {
            type: Boolean,
            default: false,
        },
        ephemeralKeyPublic: {
            type: String,
            required: function () { return this.isInitialMessage; },
        },
        senderIdentityKey: {
            type: String,
            required: function () { return this.isInitialMessage; },
        },
        otkKeyId: {
            type: String,
        },
        nonce: {
            type: String,
            required: function () { return this.isInitialMessage; },
        },
        sessionId: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;

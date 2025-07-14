import Message from '../models/message.model.js';
import User from '../models/user.model.js';
import { getReceiverSocketId, io } from '../lib/socket.js';

export const sendInitialMessage = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const senderId = req.user._id;
        const senderIdentityKey = req.user.identityKey;
        const {
            sessionId,
            encryptedMessage, 
            nonce,
            ephemeralKeyPublic,
            otkKeyId,
        } = req.body;
    
        const initialMessage = new Message({
            senderId,
            receiverId,
            messageText: encryptedMessage,
            isInitialMessage: true,
            ephemeralKeyPublic,
            senderIdentityKey,
            otkKeyId,
            nonce,
            sessionId,
        });

        await initialMessage.save();

        // Emit socket notification to the receiver
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("sessionStarted", {
                startedBy: senderId,
                message: "New secure session started"
            });
        }

        console.log("Initial message sent:", initialMessage);

        res.status(201).json(initialMessage);
    } catch (error) {
        console.error("Error sending initial message:", error.message);
        res.status(500).json({ message: "Internal server error" });
    };
};

export const getInitialMessage = async (req, res) => {
    try {
        const receiverId = req.user._id;
        const senderId = req.params.id;

        const initialMessage = await Message.findOne({
            senderId,
            receiverId,
            isInitialMessage: true
        }).sort({ createdAt: -1 });

        if (!initialMessage) {
            return res.status(200).json({ message: "Initial message not found" });
        }

        console.log("Initial message received:", initialMessage);

        // delete the initial message from the database after fetching it
        await Message.deleteOne({ _id: initialMessage._id });
        
        res.status(200).json(initialMessage);


    } catch (error) {
        console.error("Error fetching initial message:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getKeys = async (receiverId) => {
    try {
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return null;
        }

        // Check if the user has one-time prekeys available
        let oneTimePreKeys = null;
        let oneTimePreKey = null;
        let otkKeyId = null;

        if (receiver.oneTimePreKeys && receiver.oneTimePreKeys.length > 0) {
            oneTimePreKeys = receiver.oneTimePreKeys;
            otkKeyId = Math.floor(Math.random() * oneTimePreKeys.length);
            oneTimePreKey = oneTimePreKeys.find(key => key.id === otkKeyId);


            // Dlete the OTK
            const index = oneTimePreKeys.findIndex(key => key.id === otkKeyId);
            oneTimePreKeys.splice(index, 1);
            receiver.oneTimePreKeys = oneTimePreKeys;
            await receiver.save();
        }

        const keys = {
            identityKey: receiver.identityKey,
            edIdentityKey: receiver.edIdentityKey,
            signedPreKey: receiver.signedPreKey,
            signedPreKeySignature: receiver.signedPreKeySignature,
        };

        if (oneTimePreKeys !== null) {
            keys.oneTimePreKey = oneTimePreKey;
            keys.otkKeyId = otkKeyId;
        }

        return keys;

    } catch(error) {
        console.error("Error fetching keys:", error.message);
        return null;
    }
};

export const getKeysRoute = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const keys = await getKeys(receiverId);
        if (!keys) {
            return res.status(404).json({ message: "Receiver not found or no keys available" });
        }

        console.log("Keys fetched:", keys);
        
        res.status(200).json(keys);
    } catch (error) {
        console.error("Error in getKeysRoute:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const endSession = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const senderId = req.user._id;

        // Emit socket event to the other user
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("sessionEnded", {
                endedBy: senderId,
                message: "Session has been ended"
            });
        }

        res.status(200).json({ message: "Session ended successfully" });
    } catch (error) {
        console.error("Error ending session:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};
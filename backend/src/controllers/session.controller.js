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
        // find a message where both ids match
        const me = req.user._id;
        const them = req.params.id;

        const initialMessage = await Message.findOne({
            isInitialMessage: true,
            $or: [
                { senderId: them,  receiverId: me   },
                { senderId: me,    receiverId: them }
            ]
        }).sort({ createdAt: -1 });

        if (!initialMessage) {
            return res.status(200).json({ message: "Initial message not found" });
        }

        console.log("Initial message received:", initialMessage);

        // delete the initial message from the database after fetching it
        //await Message.deleteOne({ _id: initialMessage._id });
        
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
            const randomIndex = Math.floor(Math.random() * receiver.oneTimePreKeys.length);
            oneTimePreKey = receiver.oneTimePreKeys[randomIndex];
            otkKeyId = oneTimePreKey.id;
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

        // Here we dont need to end the session of the other user
        /*
        // Emit socket event to the other user
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("sessionEnded", {
                endedBy: senderId,
                message: "Session has been ended"
            });
        }
        */

        res.status(200).json({ message: "Session ended successfully" });
    } catch (error) {
        console.error("Error ending session:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const deletePublicKey = async (req, res) => {
    try {
        const { otkKeyId } = req.params;
        const userId = req.user._id;

        const user = await User.findById(userId);

        if (!user) {
            return null;
        }

        const keyId = parseInt(otkKeyId);

        const otkExists = user.oneTimePreKeys.some(key => key.id === keyId);
        if (!otkExists) {
            console.log(`OTK ${keyId} not found for user ${userId}`);
            return res.status(404).json({ message: "One-time prekey not found" });
        }
        
        // Delete the public otk
        await User.updateOne(
            { _id: userId },
            { $pull: { oneTimePreKeys: { id: keyId } } }
        );

        res.status(200).json({ 
            message: "One-time prekey deleted successfully",
            deletedKeyId: keyId 
        });

    } catch (error) {
        console.error("Error deleting public key:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updateReceiverSessionInfo = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const senderId = req.user._id;

        // Update session info for the receiver
        const updatedMessage = await Message.findOneAndUpdate(
            { senderId, receiverId, isInitialMessage: true },
            { $set: { "sessionInfo.receiverHasReceived": true } },
            { new: true }
        );

        if (!updatedMessage) {
            return res.status(404).json({ message: "Initial message not found" });
        }

        console.log("Receiver session info updated:", updatedMessage);
        res.status(200).json(updatedMessage);
    } catch (error) {
        console.error("Error updating receiver session info:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};
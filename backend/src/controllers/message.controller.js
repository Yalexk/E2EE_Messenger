import User from '../models/user.model.js';
import Message from '../models/message.model.js';
import { getReceiverSocketId, io } from '../lib/socket.js';

export const getUsersForSideBar = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;
        const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select('-password');
        
        res.status(200).json(filteredUsers);
    } catch (error) {
        console.error("Error fetching users for sidebar:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const myId = req.user._id;

        // find all the messages between the logged-in user and the receiver
        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: receiverId },
                { senderId: receiverId, receiverId: myId }
            ]
        })

        res.status(200).json(messages);

    } catch(error) {
        console.error("Error fetching messages:", error.message);
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
            oneTimePreKey = oneTimePreKeys[otkKeyId];
            oneTimePreKeys.splice(otkKeyId, 1);
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
}

// TODO gonna need to change this later to include e2ee - for now just a simple text message
export const sendMessage = async (req, res) => {
    // call getKeys when sendMessage is called
    // this will return the public keys of the receiver
    // then alice will verify the public keys of the receiver
    // then alice will encrypt the message using the public keys of the receiver
    // then alice will send the encrypted message to the receiver
    // the receiver will decrypt the message using their private keys
    // and then the receiver will send the decrypted message to the frontend
    // the frontend will display the decrypted message in the chat
    
    try {
        const { text } = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.user._id;
        
        console.log("getKeys called with receiverId:", receiverId);

        const receiverKeys = await getKeys(receiverId);

        if (!receiverKeys) {
            return res.status(404).json({ message: "Receiver not found or no keys available" });
        }
        console.log("Keys fetched:", receiverKeys);

        const newMessage = new Message({
            senderId,
            receiverId,
            text
        });

        await newMessage.save();
        
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) { 
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        res.status(201).json(newMessage);
    } catch (error) {
        console.error("Error sending message:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

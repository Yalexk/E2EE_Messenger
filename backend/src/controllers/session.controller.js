import Message from '../models/message.model.js';

export const sendInitialMessage = async (req, res) => {
    try {
        const { id: receiverId } = req.params;
        const senderId = req.user._id;
        const senderIdentityKey = req.user.identityKey;
        const {
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
        });

        await initialMessage.save();

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
        });

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
}
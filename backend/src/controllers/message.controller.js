import User, { publicUser } from '../models/user.model.js';
import Message from '../models/message.model.js';
import { emitToUser, getOnlineUserIds } from '../lib/socket.js';
import * as bot from '../bot/bot.js';
import { isObjectId, isB64, isGcmNonce, isShortId, MAX_MESSAGE_BYTES } from '../lib/validate.js';

export const getUsersForSideBar = async (req, res, next) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('username identityKey edIdentityKey isBot createdAt')
      .sort({ isBot: -1, createdAt: -1 })
      .limit(200)
      .lean();
    res.status(200).json({ users: users.map(publicUser), online: getOnlineUserIds() });
  } catch (error) {
    next(error);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: 'Invalid user id' });
    const me = req.user._id;
    const messages = await Message.find({
      isInitialMessage: false,
      $or: [
        { senderId: me, receiverId: id },
        { senderId: id, receiverId: me },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();
    res.status(200).json(messages);
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { id: receiverId } = req.params;
    const { messageText, nonce, sessionId } = req.body ?? {};
    if (!isObjectId(receiverId) || receiverId === String(req.user._id)) return res.status(400).json({ message: 'Invalid receiver' });
    if (!isB64(messageText, MAX_MESSAGE_BYTES) || !isGcmNonce(nonce) || !isShortId(sessionId, 100)) {
      return res.status(400).json({ message: 'Malformed message' });
    }
    if (!(await User.exists({ _id: receiverId }))) return res.status(404).json({ message: 'User not found' });

    const message = await Message.create({ senderId: req.user._id, receiverId, messageText, nonce, sessionId });
    const plain = message.toObject();
    emitToUser(receiverId, 'newMessage', plain);
    if (bot.isBot(receiverId)) bot.handleMessage(plain).catch((e) => console.error('[bot]', e));

    res.status(201).json(plain);
  } catch (error) {
    next(error);
  }
};

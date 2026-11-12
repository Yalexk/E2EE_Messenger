import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

export const protectRoute = async (req, res, next) => {
  const token = req.cookies?.jwt;
  if (!token) return res.status(401).json({ message: 'Not logged in' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }

  try {
    const user = await User.findById(decoded.userId).select('-password -oneTimePreKeys');
    if (!user || user.isBot) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

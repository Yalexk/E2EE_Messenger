import jwt from 'jsonwebtoken';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function cookieOptions() {
  return {
    httpOnly: true, // not readable from JS, so XSS can't steal the session
    sameSite: 'strict', // not sent on cross-site requests (CSRF)
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function generateToken(userId, res) {
  const token = jwt.sign({ userId: String(userId) }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('jwt', token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
  return token;
}

import jwt from 'jsonwebtoken';
export const generateToken= (userId, res)=> {

    const token = jwt.sign({userId}, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });

    res.cookie("jwt", token, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
        httpOnly: true, // prevents XSS
        sameSite: 'strict', // Helps prevent CSRF attacks -- learnt in week 3
        secure: process.env.NODE_ENV !== 'development', // Use secure cookies in production
        
    });

    return token;
};
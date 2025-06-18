import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

export const signup = async (req, res) => {
    const { username, email, password } = req.body;
    try {
        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const user1 = await User.findOne({email})
        if (user1) return res.status(400).json({ message: "Email already in use" });

        const user2 = await User.findOne({username})
        if (user2) return res.status(400).json({ message: "Username already in use" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });

        if(newUser) {
            // generate jwt token
            generateToken(newUser._id, res);
            await newUser.save();
            return res.status(201).json({
                message: "User created successfully",
                user: {
                    _id: newUser._id,
                    username: newUser.username,
                    email: newUser.email,
                },
            });
        } else {
            return res.status(400).json({ message: "Invalid user data" });
        }

    } catch (error) {
        console.error("Error during signup:", error);
        return res.status(500).json({ message: "Internal server error" });
    }

};

export const login = (req, res) => {
    res.send("login route");
};

export const logout = (req, res) => {
    res.send("logout route");
};
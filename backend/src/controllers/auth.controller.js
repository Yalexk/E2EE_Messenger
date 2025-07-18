import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

export const signup = async (req, res) => {
    const {
        username,
        password,
        identityKey,
        edIdentityKey,
        signedPreKey,
        signedPreKeySignature,
        oneTimePreKeys
    } = req.body;

    try {
        if (!username || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const user = await User.findOne({ username });
        if (user) return res.status(400).json({ message: "Username already in use" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            password: hashedPassword,
            identityKey,
            edIdentityKey,
            signedPreKey,
            signedPreKeySignature,
            oneTimePreKeys,
        });

        if (newUser) {
            // generate jwt token
            generateToken(newUser._id, res);
            await newUser.save();
            return res.status(201).json({
            message: "User created successfully",
            user: {
                _id: newUser._id,
                username: newUser.username,
                identityKey: newUser.identityKey,
                edIdentityKey: newUser.edIdentityKey,
                signedPreKey: newUser.signedPreKey,
                signedPreKeySignature: newUser.signedPreKeySignature,
                oneTimePreKeys: newUser.oneTimePreKeys,
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

export const login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: "Invalid username or password" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Invalid username or password" });
        }

        // generate jwt token
        generateToken(user._id, res);

        // check number of one time prekeys, if less than 10, generate more
        const generateOtks = user.oneTimePreKeys.length < 10;

        // check if its been 3 days since the last prekey update
        const lastUpdated = new Date(user.lastUpdated);
        const daysSinceLastUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24); // in days

        res.status(200).json({
            message: "Login successful",
            user: {
                _id: user._id,
                username: user.username,
            },
            generateOtks: generateOtks,
            generateNewPrekeys: daysSinceLastUpdate > 3
        });
    } catch (error) {
        console.log("Error during login:", error.message);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const logout = (req, res) => {
    try {
        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        console.error("Error during logout:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const checkAuth = (req, res) => {
    try {
        res.status(200).json(req.user);
    } catch (error) {
        console.error("Error in checkAuth:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const addOneTimePreKeys = async (req, res) => {
    const { username, oneTimePreKeys } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        } 
        user.oneTimePreKeys.push(...oneTimePreKeys);
        await user.save();
    } catch (error) {
        console.error("Error adding one-time prekeys:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export const replaceSignedPrekey = async (req, res) => {
    const { username, signedPreKey, signedPreKeySignature } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        } 

        user.signedPreKey = signedPreKey;
        user.signedPreKeySignature = signedPreKeySignature;
        user.lastUpdatedPrekey = new Date();
        await user.save();

        res.status(200).json({ message: "Signed prekey updated successfully" });
    } catch (error) {
        console.error("Error adding one-time prekeys:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}
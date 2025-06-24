import express from "express";
import { signup, login, logout, checkAuth } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Signup for the chatting app
 *     description: Adds the user to the database
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 example: mysecretpassword
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid user data
 *       500:
 *         description: Internal server error
 */
router.post("/signup", signup);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login to the chatting app
 *     description: Authenticates a user and returns a token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 example: mysecretpassword
 *     responses:
 *       200:
 *         description: User logged in successfully
 *       400:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout from the chatting app
 *     description: Logs out the user
 *     requestBody:
 *       required: false
 *     responses:
 *       200:
 *         description: User logged out successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/logout", logout);

/**
 * @swagger
 * /auth/check:
 *   get:
 *     summary: Check user authentication status
 *     description: Checks if the user is authenticated (e.g., after a page refresh). Requires a valid JWT cookie.
 *     responses:
 *       200:
 *         description: User is authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 60d0fe4f5311236168a109ca
 *                 username:
 *                   type: string
 *                   example: johndoe
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: User is not authenticated
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get("/check", protectRoute, checkAuth);

export default router;
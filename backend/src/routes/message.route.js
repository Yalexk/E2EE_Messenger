import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { getUsersForSideBar, getMessages, sendMessage, getKeysRoute, sendInitialMessage } from '../controllers/message.controller.js';

const router = express.Router();

/**
 * @swagger
 * /message/user:
 *   get:
 *     summary: Get all users except the logged-in user
 *     description: Returns a list of users for the sidebar, excluding the currently authenticated user.
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   username:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/user", protectRoute, getUsersForSideBar);

/**
 * @swagger
 * /message/{id}:
 *   get:
 *     summary: Get all messages between the logged-in user and another user
 *     description: Returns all messages exchanged between the authenticated user and the user with the given ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID of the other participant in the chat
 *     responses:
 *       200:
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   senderId:
 *                     type: string
 *                   receiverId:
 *                     type: string
 *                   text:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", protectRoute, getMessages);

/**
 * @swagger
 * /message/send{id}:
 *   post:
 *     summary: Send a message to another user
 *     description: Sends a text message from the authenticated user to the user with the given ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID of the message recipient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 example: Hello, how are you?
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 senderId:
 *                   type: string
 *                 receiverId:
 *                   type: string
 *                 text:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/send/:id", protectRoute, sendMessage);

router.get('/keys/:id', protectRoute, getKeysRoute);

router.post('/sendInitial/:id', protectRoute, sendInitialMessage);

export default router;
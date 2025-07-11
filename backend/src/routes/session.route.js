import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { sendInitialMessage, getInitialMessage } from '../controllers/session.controller.js';

const router = express.Router();

router.post('/sendInitial/:id', protectRoute, sendInitialMessage);

router.get('/initial/:id', protectRoute, getInitialMessage);


export default router;
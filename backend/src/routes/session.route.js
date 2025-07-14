import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { sendInitialMessage, getInitialMessage, getKeysRoute, endSession, deletePublicKey } from '../controllers/session.controller.js';

const router = express.Router();

router.post('/sendInitial/:id', protectRoute, sendInitialMessage);

router.get('/initial/:id', protectRoute, getInitialMessage);

router.get('/keys/:id', protectRoute, getKeysRoute);

router.post('/endSession/:id', protectRoute, endSession);

router.delete('/otk/:otkKeyId', protectRoute, deletePublicKey);
export default router;
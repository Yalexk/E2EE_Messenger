import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { sendInitialMessage, getInitialMessage, getKeysRoute, endSession, updateSessionInfo } from '../controllers/session.controller.js';

const router = express.Router();

router.get('/keys/:id', protectRoute, getKeysRoute); // fetch prekey bundle (consumes one OPK)
router.post('/sendInitial/:id', protectRoute, sendInitialMessage); // X3DH initial message
router.get('/initial/:id', protectRoute, getInitialMessage);
router.put('/updateSessionInfo/:id', protectRoute, updateSessionInfo);
router.post('/endSession/:id', protectRoute, endSession);

export default router;

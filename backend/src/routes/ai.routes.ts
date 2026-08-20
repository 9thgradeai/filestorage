import { Router } from 'express';
import { chat } from '../controllers/ai.controller';
import { authenticate } from '../middleware/authenticate';
import { csrfProtect } from '../middleware/csrf';

const router = Router();

router.post('/chat', authenticate, csrfProtect, chat);

export default router;
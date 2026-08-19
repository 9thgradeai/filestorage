import { Router } from 'express';
import { register, login, refresh, logout, me } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { csrfProtect } from '../middleware/csrf';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', csrfProtect, logout);
router.get('/me', authenticate, me);

export default router;
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ssoCallback, ssoValidate } from '../controllers/sso.controller.js';

const router = Router();

// SSO callback (browser redirect flow)
router.get('/callback', asyncHandler(ssoCallback));

// SSO validate (API/SPA flow)
router.post('/validate', asyncHandler(ssoValidate));

export default router;

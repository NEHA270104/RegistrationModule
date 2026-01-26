import { Router } from 'express';
import seatsRouter from './seats.routes.js';
import paymentRouter from './payment.routes.js';
import registrationRouter from './registration.routes.js';
import waitlistRouter from './waitlist.routes.js';
import adminRouter from './admin.routes.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
router.use('/seats', seatsRouter);
router.use('/', paymentRouter);
router.use('/registration', registrationRouter);
router.use('/waitlist', waitlistRouter);
router.use('/admin', adminRouter);

export default router;

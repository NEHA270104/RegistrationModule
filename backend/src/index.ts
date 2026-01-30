import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { testDatabaseConnection } from './config/supabase.js';
import { logger } from './utils/logger.js';
import {
  errorHandler,
  notFoundHandler,
  handleUnhandledRejection,
  handleUncaughtException,
} from './middleware/errorHandler.js';
import { standardLimiter, adminLimiter } from './middleware/rateLimiter.js';
import routes from './routes/index.js';
import { abandonmentService } from './services/abandonment.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle uncaught errors
handleUnhandledRejection();
handleUncaughtException();

// Create Express app
const app: Express = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable for development
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Firebase Hosting proxy, etc.)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        config.frontendUrl,
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        // Firebase Hosting domains
        'https://bizflowai-478116.web.app',
        'https://bizflowai-478116.firebaseapp.com',
        // Custom domain
        'https://registration.bizflowai.in',
        // Cloud Run domain
        'https://bizflow-registration-847587405518.asia-south1.run.app',
      ];

      if (allowedOrigins.includes(origin) || config.nodeEnv === 'development') {
        callback(null, true);
      } else {
        logger.warn('CORS blocked origin:', { origin });
        callback(null, true); // Allow all origins for now to debug
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Razorpay-Signature'],
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    logger.log(logLevel, 'HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')?.substring(0, 100),
    });
  });

  next();
});

// Apply rate limiting to API routes
// Admin routes with API key skip rate limiting, others use standard limiter
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  // Skip global rate limit for admin routes when API key is present
  const isAdminRoute = req.path.startsWith('/admin') || req.path.startsWith('/settings/admin');
  const hasApiKey = !!req.headers['x-api-key'];

  if (isAdminRoute && hasApiKey) {
    return next(); // Skip rate limiting for authenticated admin requests
  }

  // Apply standard rate limiting for all other requests
  return standardLimiter(req, res, next);
});

// API routes
app.use('/api', routes);

// Serve frontend static files
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// Serve admin dashboard
app.get('/admin', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'admin', 'index.html'));
});

// Serve waitlist page
app.get('/waitlist', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'waitlist.html'));
});

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 404 handler for API routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
async function startServer(): Promise<void> {
  try {
    // Test database connection
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Start listening
    app.listen(config.port, () => {
      logger.info(`Server started`, {
        port: config.port,
        env: config.nodeEnv,
        url: `http://localhost:${config.port}`,
      });

      logger.info('API Endpoints ready:', {
        health: `http://localhost:${config.port}/api/health`,
        seats: `http://localhost:${config.port}/api/seats`,
        createOrder: `http://localhost:${config.port}/api/create-order`,
      });

      // Start automatic cleanup of expired pending registrations
      startAutomaticCleanup();
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
}

// Automatic cleanup of expired pending registrations
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let cleanupIntervalId: NodeJS.Timeout | null = null;

function startAutomaticCleanup(): void {
  // Run immediately on startup
  runCleanup();

  // Then run every 5 minutes
  cleanupIntervalId = setInterval(runCleanup, CLEANUP_INTERVAL_MS);

  logger.info('Automatic cleanup started', {
    intervalMinutes: CLEANUP_INTERVAL_MS / 60000,
  });
}

async function runCleanup(): Promise<void> {
  try {
    const result = await abandonmentService.releaseExpiredRegistrations();

    if (result.released > 0) {
      logger.info('Auto-cleanup completed', {
        released: result.released,
        registrations: result.releasedRegistrations.map((r) => r.email),
      });
    }
  } catch (error) {
    logger.error('Auto-cleanup error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  if (cleanupIntervalId) clearInterval(cleanupIntervalId);
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  if (cleanupIntervalId) clearInterval(cleanupIntervalId);
  process.exit(0);
});

// Start the server
startServer();

export default app;

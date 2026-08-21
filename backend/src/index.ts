import 'dotenv/config';
import path from 'path';
console.log('ANTIGRAVITY DEBUG: RAZORPAY_KEY_ID is:', process.env.RAZORPAY_KEY_ID ? 'LOADED' : 'MISSING');

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import authRouter from './routes/auth.routes.js';
import publicRouter from './routes/public.routes.js';
import { abandonmentService } from './services/abandonment.service.js';
import { domainRouter } from './middleware/domainRouter.js';
import { initializeJobs } from './jobs/index.js';

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
        // Agent Studio
        'https://agentstudio.brtneura.com',
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Razorpay-Signature', 'X-Agent-Studio-Key', 'X-Webhook-Secret'],
  })
);

// Body parsing middleware
app.use(express.json({
  limit: '10mb',
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
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

// Custom domain routing — resolve custom domains to tenant slugs before other middleware
app.use(domainRouter);

// Serve frontend static files and handle assets path rewriting/redirections first to avoid route conflicts
const frontendPath = path.join(__dirname, '../../frontend');

// Explicit Router for dashboard navigation to guarantee text/html serving
const dashboardRouter = express.Router();
dashboardRouter.get('/events.html', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(frontendPath, 'dashboard', 'events.html'));
});
dashboardRouter.get('/flyer-generation.html', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(frontendPath, 'dashboard', 'flyer-generation.html'));
});
dashboardRouter.get('/email-templates.html', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(frontendPath, 'dashboard', 'email-templates.html'));
});
dashboardRouter.get('/settings.html', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(frontendPath, 'dashboard', 'settings.html'));
});
app.use('/dashboard', dashboardRouter);

// Redirect /t/:slug to /t/:slug/ and /dashboard/:slug to /dashboard/:slug/ to resolve relative asset loading issues
app.use((req: Request, res: Response, next: NextFunction) => {
  const matchDashboard = req.path.match(/^\/dashboard\/([^/.]+)$/);
  if (matchDashboard) {
    return res.redirect(301, `/dashboard/${matchDashboard[1]}/`);
  }
  const matchTenant = req.path.match(/^\/t\/([^/.]+)$/);
  if (matchTenant) {
    return res.redirect(301, `/t/${matchTenant[1]}/`);
  }
  next();
});

// Rewrite dynamic paths for static assets (e.g. /dashboard/:slug/css/foo.css -> /dashboard/css/foo.css)
app.use((req: Request, res: Response, next: NextFunction) => {
  const matchDashboard = req.url.match(/^\/dashboard\/[^/]+\/(css|js|images)\/(.+)$/);
  if (matchDashboard) {
    req.url = `/dashboard/${matchDashboard[1]}/${matchDashboard[2]}`;
  }
  const matchTenant = req.url.match(/^\/t\/[^/]+\/(css|js|images)\/(.+)$/);
  if (matchTenant) {
    req.url = `/${matchTenant[1]}/${matchTenant[2]}`;
  }
  const matchAdminPortal = req.url.match(/^\/admin-portal\/(css|js|images)\/(.+)$/);
  if (matchAdminPortal) {
    req.url = `/super-admin/${matchAdminPortal[1]}/${matchAdminPortal[2]}`;
  }
  next();
});

// Static files (CSS, JS, images, etc.) — index option disabled so / doesn't serve frontend/index.html
app.use('/dashboard', express.static(path.join(frontendPath, 'dashboard'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    }
  }
}));
app.use('/super-admin', express.static(path.join(frontendPath, 'super-admin'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    }
  }
}));
app.use(express.static(frontendPath, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    }
  }
}));

// Apply rate limiting to API routes
// Admin routes with API key skip rate limiting, others use standard limiter
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  // Skip global rate limit for admin routes when API key is present
  const isAdminRoute = req.path.includes('/admin');
  const hasApiKey = !!req.headers['x-api-key'];

  if (isAdminRoute && hasApiKey) {
    return next(); // Skip rate limiting for authenticated admin requests
  }

  // Apply standard rate limiting for all other requests
  return standardLimiter(req, res, next);
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api', routes);

// Landing page at root (must be before wildcard routes but after static assets)
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'landing', 'index.html'));
});

// Serve admin dashboard (legacy)
app.get('/admin', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'admin', 'index.html'));
});

// Serve onboarding wizard
app.get('/onboarding', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'onboarding', 'index.html'));
});

// Serve tenant dashboard
app.get('/dashboard', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'dashboard', 'index.html'));
});
app.get('/dashboard/*', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'dashboard', 'index.html'));
});

// Serve super admin panel
app.get('/super-admin', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'super-admin', 'index.html'));
});
app.get('/super-admin/*', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'super-admin', 'index.html'));
});

// Serve admin portal
app.get('/admin-portal', (req: Request, res: Response) => {
  if (process.env.DEVELOPMENT_MODE !== 'false') {
    res.sendFile(path.join(frontendPath, 'super-admin', 'dashboard.html'));
  } else {
    res.sendFile(path.join(frontendPath, 'super-admin', 'index.html'));
  }
});
app.get('/admin-portal/*', (req: Request, res: Response) => {
  if (process.env.DEVELOPMENT_MODE !== 'false') {
    res.sendFile(path.join(frontendPath, 'super-admin', 'dashboard.html'));
  } else {
    res.sendFile(path.join(frontendPath, 'super-admin', 'index.html'));
  }
});

// Serve waitlist page
app.get('/waitlist', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'waitlist.html'));
});

// Serve reset password page
app.get('/reset-password', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'reset-password.html'));
});

// Serve tenant-scoped registration form /t/:slug
app.get('/t/:slug', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Serve automated public event registration form /register/:eventSlug
app.get('/register/:eventSlug', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'register.html'));
});
app.get('/register', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'register.html'));
});

// Fallback: serve landing page for unknown non-API routes
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'landing', 'index.html'));
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
    const server = app.listen(config.port, () => {
      logger.info(`Server started`, {
        port: config.port,
        env: config.nodeEnv,
        url: `http://localhost:${config.port}`,
      });

      logger.info('API Endpoints ready:', {
        health: `http://localhost:${config.port}/api/health`,
        seats: `http://localhost:${config.port}/api/seats`,
        createOrder: `http://localhost:${config.port}/api/create-order`,
        auth: `http://localhost:${config.port}/api/auth`,
      });

      // Start automatic cleanup of expired pending registrations
      startAutomaticCleanup();

      // Initialize scheduled cron jobs (Phase 4)
      initializeJobs();
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use. Please check if another instance of the server is running on this port.`);
        process.exit(1);
      } else {
        logger.error('Server error occurred', { error: error.message });
        process.exit(1);
      }
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

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { config } from '../config/index.js';

/**
 * Global error handler middleware
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log the error
  logger.error('Error occurred', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    body: config.nodeEnv === 'development' ? req.body : undefined,
  });

  // Handle AppError (our custom errors)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    });
    return;
  }

  // Handle Razorpay errors
  if (err.name === 'RazorpayError' || (err as Error & { statusCode?: number }).statusCode) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
    res.status(statusCode).json({
      success: false,
      error: {
        message: 'Payment processing error',
        code: 'PAYMENT_ERROR',
        details:
          config.nodeEnv === 'development'
            ? { originalError: err.message }
            : undefined,
      },
    });
    return;
  }

  // Handle Supabase errors
  if (err.message?.includes('supabase') || err.message?.includes('PGRST')) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Database error occurred',
        code: 'DATABASE_ERROR',
      },
    });
    return;
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid JSON payload',
        code: 'INVALID_JSON',
      },
    });
    return;
  }

  // Handle CORS errors
  if (err.message?.includes('CORS') || err.message?.includes('Not allowed by CORS')) {
    res.status(403).json({
      success: false,
      error: {
        message: 'Request blocked. Please try again.',
        code: 'CORS_ERROR',
      },
    });
    return;
  }

  // Default to 500 Internal Server Error
  // Provide more helpful message in production
  const productionMessage = err.message?.includes('network')
    ? 'Network error. Please check your connection and try again.'
    : err.message?.includes('timeout')
    ? 'Request timed out. Please try again.'
    : 'Something went wrong. Please try again or contact support.';

  res.status(500).json({
    success: false,
    error: {
      message:
        config.nodeEnv === 'production'
          ? productionMessage
          : err.message,
      code: 'INTERNAL_ERROR',
      ...(config.nodeEnv === 'development' && {
        stack: err.stack,
      }),
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      message: `Endpoint ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason: Error) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });
  });
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });

    // Give time for logging before exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
};

const logger = require('../utils/logger');

// Centralized error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.logError(err, req);

  // Default error response
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errorCode = 'INTERNAL_ERROR';
  let details = null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errorCode = 'VALIDATION_ERROR';
    details = err.details || err.message;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    errorCode = 'INVALID_ID';
  } else if (err.code === '23505') { // PostgreSQL unique constraint violation
    statusCode = 409;
    message = 'Resource already exists';
    errorCode = 'DUPLICATE_RESOURCE';
    details = err.detail || 'A resource with this value already exists';
  } else if (err.code === '23503') { // PostgreSQL foreign key constraint violation
    statusCode = 400;
    message = 'Invalid reference';
    errorCode = 'INVALID_REFERENCE';
    details = 'Referenced resource does not exist';
  } else if (err.code === '23502') { // PostgreSQL not null constraint violation
    statusCode = 400;
    message = 'Required field missing';
    errorCode = 'REQUIRED_FIELD_MISSING';
    details = err.column || 'A required field is missing';
  } else if (err.code === '22003') { // PostgreSQL numeric value out of range
    statusCode = 400;
    message = 'Value out of range';
    errorCode = 'VALUE_OUT_OF_RANGE';
  } else if (err.code === '22001') { // PostgreSQL string data right truncation
    statusCode = 400;
    message = 'Data too long';
    errorCode = 'DATA_TOO_LONG';
  } else if (err.message.includes('Email already exists') || err.message.includes('Email already registered')) {
    statusCode = 409;
    message = 'Email already registered';
    errorCode = 'EMAIL_EXISTS';
  } else if (err.message.includes('Invalid email or password')) {
    statusCode = 401;
    message = 'Invalid credentials';
    errorCode = 'INVALID_CREDENTIALS';
  } else if (err.message.includes('User not found')) {
    statusCode = 404;
    message = 'User not found';
    errorCode = 'USER_NOT_FOUND';
  } else if (err.message.includes('Insufficient balance')) {
    statusCode = 400;
    message = 'Insufficient balance';
    errorCode = 'INSUFFICIENT_BALANCE';
  } else if (err.message.includes('Invalid transfer')) {
    statusCode = 400;
    message = 'Invalid transfer';
    errorCode = 'INVALID_TRANSFER';
  } else if (err.message.includes('Recipient not found')) {
    statusCode = 404;
    message = 'Recipient not found';
    errorCode = 'RECIPIENT_NOT_FOUND';
  } else if (err.message.includes('Cannot transfer to yourself')) {
    statusCode = 400;
    message = 'Cannot transfer to yourself';
    errorCode: 'SELF_TRANSFER_NOT_ALLOWED';
  } else if (err.message.includes('Transaction not found')) {
    statusCode = 404;
    message = 'Transaction not found';
    errorCode = 'TRANSACTION_NOT_FOUND';
  } else if (err.message.includes('Access denied')) {
    statusCode = 403;
    message = 'Access denied';
    errorCode = 'ACCESS_DENIED';
  } else if (err.message.includes('Token')) {
    statusCode = 401;
    message = 'Authentication error';
    errorCode = 'TOKEN_ERROR';
  } else if (err.message.includes('Password')) {
    statusCode = 400;
    message = 'Password error';
    errorCode = 'PASSWORD_ERROR';
  }

  // Handle JWT specific errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    errorCode = 'INVALID_TOKEN';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    errorCode = 'TOKEN_EXPIRED';
  } else if (err.name === 'NotBeforeError') {
    statusCode = 401;
    message = 'Token not active';
    errorCode = 'TOKEN_NOT_ACTIVE';
  }

  // Handle validation errors from express-validator
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON';
    errorCode = 'INVALID_JSON';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request entity too large';
    errorCode = 'PAYLOAD_TOO_LARGE';
  }

  // Handle database connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    statusCode = 503;
    message = 'Database connection failed: The host is unreachable. Check your internet or DATABASE_URL.';
    errorCode = 'DATABASE_CONNECTION_ERROR';
  } else if (err.code === 'ETIMEDOUT') {
    statusCode = 503;
    message = 'Database connection timeout';
    errorCode = 'DATABASE_TIMEOUT';
  }

  // Build error response
  const errorResponse = {
    success: false,
    message,
    error: errorCode,
    timestamp: new Date().toISOString()
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = details || err.message;
    errorResponse.stack = err.stack;
  } else if (details && statusCode < 500) {
    // Include safe details in production for client errors
    errorResponse.details = details;
  }

  // Add request ID if available
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }

  // Add path for debugging
  if (process.env.NODE_ENV === 'development') {
    errorResponse.path = req.originalUrl;
    errorResponse.method = req.method;
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
const notFoundHandler = (req, res) => {
  logger.warn('404 - Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString(),
    path: req.originalUrl
  });
};

// Validation error handler
const validationErrorHandler = (validationResult) => {
  return (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }));

      logger.warn('Validation failed', {
        method: req.method,
        url: req.originalUrl,
        errors: errorMessages
      });

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'VALIDATION_ERROR',
        details: errorMessages,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Database error handler
const databaseErrorHandler = (error, req, res, next) => {
  // Log database errors with more context
  logger.error('Database error', {
    error: error.message,
    code: error.code,
    severity: error.severity,
    detail: error.detail,
    hint: error.hint,
    query: error.query,
    parameters: error.parameters,
    table: error.table,
    column: error.column,
    constraint: error.constraint,
    file: error.file,
    line: error.line,
    routine: error.routine,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });

  // Pass to general error handler
  next(error);
};

// Rate limit error handler
const rateLimitHandler = (req, res) => {
  logger.logSecurity('RATE_LIMIT_EXCEEDED', 'high', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    url: req.originalUrl
  });

  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    error: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString(),
    retryAfter: 60 // Suggest retry after 60 seconds
  });
};

// CORS error handler
const corsErrorHandler = (err, req, res, next) => {
  if (err.message.includes('CORS')) {
    logger.logSecurity('CORS_VIOLATION', 'medium', {
      origin: req.get('Origin'),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip
    });

    return res.status(403).json({
      success: false,
      message: 'Cross-origin request blocked',
      error: 'CORS_ERROR',
      timestamp: new Date().toISOString()
    });
  }

  next(err);
};

// Request timeout handler
const timeoutHandler = (req, res) => {
  logger.warn('Request timeout', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(408).json({
    success: false,
    message: 'Request timeout',
    error: 'REQUEST_TIMEOUT',
    timestamp: new Date().toISOString()
  });
};

// Payload too large handler
const payloadTooLargeHandler = (req, res) => {
  logger.warn('Payload too large', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    contentLength: req.get('Content-Length')
  });

  res.status(413).json({
    success: false,
    message: 'Request payload too large',
    error: 'PAYLOAD_TOO_LARGE',
    timestamp: new Date().toISOString()
  });
};

// Health check error handler
const healthCheckErrorHandler = (error, req, res, next) => {
  // For health check endpoints, return minimal error info
  if (req.originalUrl.includes('/health')) {
    return res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  validationErrorHandler,
  databaseErrorHandler,
  rateLimitHandler,
  corsErrorHandler,
  timeoutHandler,
  payloadTooLargeHandler,
  healthCheckErrorHandler
};

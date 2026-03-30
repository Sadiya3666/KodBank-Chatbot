require('dotenv').config();
const app = require('./app');
const database = require('./config/database');
const logger = require('./utils/logger');
const jwtModel = require('./models/jwtModel');

const PORT = process.env.PORT || 5000;

// Start server
const server = app.listen(PORT, async () => {
  try {
    logger.info(`Server starting on port ${PORT}`);

    // Test database connection
    await database.testConnection();

    // Run migrations if in development or if explicitly requested
    if (process.env.NODE_ENV === 'development' || process.env.RUN_MIGRATIONS === 'true') {
      logger.info('Running database migrations...');
      await database.runMigrations();
    }

    // Seed database if requested
    if (process.env.SEED_DATABASE === 'true') {
      logger.info('Seeding database...');
      await database.seedDatabase();
    }

    // Ensure blacklist table exists
    await jwtModel.createBlacklistTable();

    // Start token cleanup cron job (runs every hour)
    setInterval(async () => {
      try {
        logger.info('Running token cleanup cron job...');
        const deletedCount = await jwtModel.cleanupExpiredTokens();
        logger.info(`Cleanup completed. Removed ${deletedCount} tokens.`);
      } catch (error) {
        logger.error('Token cleanup cron job failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    logger.info(`Server started successfully on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`API Base URL: http://localhost:${PORT}/api`);
    logger.info(`Health Check: http://localhost:${PORT}/health`);
    logger.info(`API Documentation: http://localhost:${PORT}/api/docs`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
});

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

  switch (error.code) {
    case 'EACCES':
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Export server for testing
module.exports = server;


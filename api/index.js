const app = require('../backend/src/app');
const database = require('../backend/src/config/database');

// Track if initialization has been done
let isInitialized = false;

// Handle Vercel serverless function
module.exports = async (req, res) => {
  // Let Express handle all headers and CORS logic
  
  // Ensure database is ready (Lazy initialization)
  if (!isInitialized) {
    try {
      if (process.env.RUN_MIGRATIONS === 'true') {
        console.log('Production initialization: running migrations...');
        await database.runMigrations();
        await database.testConnection();
      }
      isInitialized = true;
    } catch (error) {
      console.error('Initialization warning (continuing...):', error.message);
      // Don't block the actual request
    }
  }
  
  // Forward the request to the Express app
  return app(req, res);
};

const app = require('../backend/src/app');
const database = require('../backend/src/config/database');

// Pre-initialize database for serverless
let isInitialized = false;

module.exports = async (req, res) => {
  if (!isInitialized) {
    try {
      await database.testConnection();
      await database.runMigrations();
      isInitialized = true;
    } catch (error) {
      console.error('Initial database connection failed:', error);
      // We don't exit, we let the app handle errors per request
    }
  }
  
  return app(req, res);
};

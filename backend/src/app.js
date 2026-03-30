const express = require('express'); // Triggering Refresh
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

// Import middleware
const {
  errorHandler,
  notFoundHandler,
  databaseErrorHandler
} = require('./middleware/errorHandler');
const {
  securityHeaders,
  requestLogger
} = require('./middleware/authMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const bankRoutes = require('./routes/bankRoutes');
const userRoutes = require('./routes/userRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');

// Import utilities
const logger = require('./utils/logger');
const database = require('./config/database');

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: true, // Allow the origin of the request
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(securityHeaders);
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined', { stream: logger.stream }));
app.use(requestLogger);

// Health check
app.get('/health', async (req, res) => {
  const health = await database.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// HF Proxy (Moved here to avoid interference)
app.use('/api/hf-proxy', async (req, res) => {
  try {
    const hfToken = process.env.HF_TOKEN;
    let targetUrl = `https://router.huggingface.co/hf-inference${req.url}`;
    if (req.url.includes('v1/chat/completions')) {
      targetUrl = `https://router.huggingface.co/v1/chat/completions`;
    }
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': req.headers['content-type'] || 'application/json'
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/user', userRoutes);
app.use('/api/chatbot', chatbotRoutes);

// Static files (for production/vercel)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../public')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });
}

// Global 404
app.use(notFoundHandler);

// Error handling
app.use(databaseErrorHandler);
app.use(errorHandler);

module.exports = app;

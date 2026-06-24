const cors = require('cors');
const express = require('express');
const app = express();
const mongoose = require('mongoose');
require('dotenv').config();
const logger = require('./utils/logger');

// Constants
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:5173',
    'https://amazon-price-tracker-one.vercel.app',
    'https://amazon-price-tracker-*.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Atomic incoming request logger middleware
app.use((req, res, next) => {
  logger.info('SERVER', `Incoming Request: ${req.method} ${req.path} | Query: ${JSON.stringify(req.query)} | Body: ${JSON.stringify(req.body)}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('SERVER', 'Health Check hit');
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.send('🛒 Amazon Price Tracker is running!');
});

// API Routes
const productRoutes = require('./routes/ProductRoutes');
app.use('/api/products', productRoutes);

// 404 handler
app.use((req, res) => {
  logger.warn('SERVER', `Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    success: false,
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('SERVER', `Fatal Error in Middleware: ${err.message}`, err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: NODE_ENV === 'development' ? err.message : {}
  });
});

// MongoDB connection with dynamic local JSON DB fallback
const startServer = async () => {
  logger.info('DB', 'Initiating connection to MongoDB Cluster...');
  try {
    // Attempt Mongoose database connection
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info('DB', '✅ MongoDB cluster connected successfully');
    
    // Start active server
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('SERVER', `🚀 Server started in ${NODE_ENV} mode`);
      logger.info('SERVER', `🔗 Local listener: http://localhost:${PORT}`);
      logger.info('SERVER', `📊 Health verification endpoint: http://localhost:${PORT}/health`);
    });

    // Handle rejections in background
    process.on('unhandledRejection', (err) => {
      logger.error('SERVER', `Unhandled Promise Rejection: ${err.message}`, err);
      server.close(() => process.exit(1));
    });

  } catch (error) {
    logger.warn('DB', `⚠️ MongoDB connection failed: ${error.message}`);
    logger.warn('DB', '⚠️ Local JSON backup database fallback mode activated');
    
    // Start server in fallback mode
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('SERVER', `🚀 Server started in Fallback Offline mode`);
      logger.info('SERVER', `🔗 Local listener: http://localhost:${PORT}`);
      logger.info('SERVER', `📊 Health verification endpoint: http://localhost:${PORT}/health`);
    });

    process.on('unhandledRejection', (err) => {
      logger.error('SERVER', `Unhandled Promise Rejection (Fallback mode): ${err.message}`, err);
    });
  }
};

// Start the application
startServer();

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { initDatabase } = require('./config/db');
const setupSwagger = require('./config/swagger');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const portalRoutes = require('./routes/portalRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger API Documentation
setupSwagger(app);

// Base Health Check Route
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Capital Link Services (CLS) Backend API',
    status: 'Operational',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      auth: '/api/auth',
      services: '/api/services',
      enquiries: '/api/enquiries',
      orders: '/api/orders',
      portal: '/api/portal'
    }
  });
});

// API Routes Registration
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/portal', portalRoutes);

// Global Error Handler
app.use(errorHandler);

// Start server function (exportable for integration tests)
const startServer = async () => {
  await initDatabase();
  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`🚀 Capital Link Services Backend Server active`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
      console.log(`=================================================`);
    });
  }
};

startServer();

module.exports = app;

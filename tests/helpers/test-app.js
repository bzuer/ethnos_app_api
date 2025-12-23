const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config({ path: '.env.test' });

const { globalErrorHandler, notFoundHandler, logger } = require('../../src/middleware/errorHandler');
const { performanceMonitoring, errorMonitoring } = require('../../src/middleware/monitoring');
const { responseFormatter } = require('../../src/middleware/responseFormatter');

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(responseFormatter);

app.use(performanceMonitoring);

const healthRoutes = require('../../src/routes/health');
const worksRoutes = require('../../src/routes/works');
const personsRoutes = require('../../src/routes/persons');
const organizationsRoutes = require('../../src/routes/organizations');
const searchRoutes = require('../../src/routes/search');
const metricsRoutes = require('../../src/routes/metrics');
const citationsRoutes = require('../../src/routes/citations');
const collaborationsRoutes = require('../../src/routes/collaborations');

const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('../../config/swagger.config');

app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpecs);
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "ethnos.app API - Documentation"
}));

app.use('/api/health', healthRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/works', worksRoutes);
app.use('/api/persons', personsRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api', citationsRoutes);
app.use('/api', collaborationsRoutes);

app.use('/', citationsRoutes);
app.use('/search', searchRoutes);
app.use('/works', worksRoutes);
app.use('/persons', personsRoutes);
app.use('/organizations', organizationsRoutes);

app.use('*', notFoundHandler);
app.use(errorMonitoring);
app.use(globalErrorHandler);

module.exports = app;

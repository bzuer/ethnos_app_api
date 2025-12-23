const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: '/etc/node-backend.env' }); } catch (_) {}

const { logger } = require('./middleware/errorHandler');

const app = require('./app');

const keyPath = path.join(__dirname, '../ssl/ethnos-api-key.pem');
const certPath = path.join(__dirname, '../ssl/ethnos-api-cert.pem');

let sslOptions = null;
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
} else if (process.env.ENABLE_HTTPS === 'true') {
  logger.warn('HTTPS requested but certificate files were not found; falling back to HTTP only', {
    keyPath,
    certPath
  });
}

const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const HTTP_PORT = process.env.PORT || 3000;

let httpsServer = null;

if (process.env.ENABLE_HTTPS === 'true' && sslOptions) {
  httpsServer = https.createServer(sslOptions, app);

  app.listen(HTTP_PORT, () => {
    logger.info(`HTTP server running on port ${HTTP_PORT}`);
  });

  httpsServer.listen(HTTPS_PORT, () => {
    logger.info(`HTTPS server running on port ${HTTPS_PORT}`);
  });
} else {
  app.listen(HTTP_PORT, () => {
    logger.info(`HTTP server running on port ${HTTP_PORT}`);
  });
}

module.exports = { app, httpsServer };

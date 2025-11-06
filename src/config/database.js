const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: '/etc/node-backend.env' }); } catch (_) {}

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'data_db',
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialect: 'mariadb',
  dialectOptions: {
    timezone: 'Etc/GMT-3',
    ...(process.env.DB_SSL === 'true' && fs.existsSync(path.join(__dirname, '../../ssl/mysql-client-cert.pem')) ? {
      ssl: {
        cert: fs.readFileSync(path.join(__dirname, '../../ssl/mysql-client-cert.pem')),
        key: fs.readFileSync(path.join(__dirname, '../../ssl/mysql-client-key.pem')),
        ca: fs.readFileSync(path.join(__dirname, '../../ssl/mysql-server-cert.pem')),
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    } : {})
  },
  pool: {
    max: 20,
    min: 0,
    acquire: 30000,
    idle: 10000,
    maxUses: 100,
  },
  query: {
    timeout: 10000,
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: false,
    freezeTableName: true,
  },
};

const sequelize = new Sequelize(config);

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');
    return true;
  } catch (error) {
    console.error('✗ Unable to connect to database:', error.message);
    return false;
  }
};

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'data_db',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  idleTimeout: 300000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

const closePool = async () => {
  try {
    await pool.end();
    console.log('✓ MySQL2 pool closed successfully');
    return true;
  } catch (error) {
    console.error('✗ Error closing MySQL2 pool:', error.message);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection,
  config,
  pool,
  closePool,
};

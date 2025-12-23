require('dotenv').config({ path: '.env.test' });

const { sequelize, closePool } = require('../src/config/database');
const redis = require('../src/config/redis');

const ensureBaseOrganizationRecord = async () => {
  try {
    await sequelize.query(`
      INSERT INTO organizations (id, name, type, country_code, city, ror_id, created_at, updated_at)
      VALUES (:id, :name, :type, :country, :city, :rorId, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        type = VALUES(type),
        country_code = VALUES(country_code),
        city = VALUES(city),
        updated_at = NOW();
    `, {
      replacements: {
        id: 1,
        name: 'Test University of Anthropology',
        type: 'UNIVERSITY',
        country: 'BR',
        city: 'Rio de Janeiro',
        rorId: 'TESTROR000000001'
      }
    });
  } catch (error) {
    console.warn('Failed to ensure baseline organization record for tests:', error.message);
  }
};

beforeAll(async () => {
  if (process.env.JEST_FAST === '1' || !process.env.DB_HOST) {
    console.warn('Skipping DB authenticate in test setup (JEST_FAST or no DB_HOST)');
    return;
  }
  try {
    await sequelize.authenticate({
      logging: false
    });
    await ensureBaseOrganizationRecord();
  } catch (error) {
    console.warn('Database connection failed in test setup:', error.message);
  }
});

afterAll(async () => {
  try {
    await sequelize.close();
  } catch (error) {
    console.warn('Error closing database connection:', error.message);
  }

  try {
    await closePool();
  } catch (error) {
    console.warn('Error closing MySQL pool:', error.message);
  }

  if (redis && typeof redis.quit === 'function') {
    try {
      await redis.quit();
    } catch (error) {
      console.warn('Error closing Redis connection:', error.message);
    }
  }
});

global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: console.warn,
  error: console.error
};

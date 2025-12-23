const { createClient } = require('redis');
try { require('dotenv').config({ path: '/etc/node-backend.env' }); } catch (_) {}

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  socket: {
    connectTimeout: 10000,
    lazyConnect: true,
  },
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
};

let client = null;
let connectPromise = null;

const resolveClient = () => (client && client.isOpen ? client : null);

const createRedisClient = async () => {
  if (resolveClient()) {
    return client;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    const url = `redis://${redisConfig.password ? `:${redisConfig.password}@` : ''}${redisConfig.host}:${redisConfig.port}`;
    const instance = createClient({
      url,
      socket: redisConfig.socket,
    });

    instance.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
    });

    instance.on('connect', () => {
      console.log('✓ Redis connected');
    });

    instance.on('disconnect', () => {
      console.warn('✗ Redis disconnected');
      client = null;
    });

    instance.on('end', () => {
      client = null;
    });

    try {
      await instance.connect();
      client = instance;
      return client;
    } catch (error) {
      console.error('✗ Redis connection failed:', error.message);
      try {
        await instance.disconnect();
      } catch (disconnectError) {
      }
      client = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
};

const getRedisClient = () => resolveClient();

const withClient = async (operation, fallback = null) => {
  try {
    let activeClient = resolveClient();
    if (!activeClient) {
      activeClient = await createRedisClient();
    }

    if (!activeClient) {
      return fallback;
    }

    return await operation(activeClient);
  } catch (error) {
    console.warn('Redis operation failed:', error.message);
    return fallback;
  }
};

const testRedisConnection = async () => {
  const activeClient = await createRedisClient();
  if (!activeClient) {
    return false;
  }

  try {
    await activeClient.ping();
    console.log('✓ Redis connection test successful');
    return true;
  } catch (error) {
    console.error('✗ Redis connection test failed:', error.message);
    return false;
  }
};

const redisWrapper = {
  get connected() {
    return !!resolveClient();
  },

  async get(key) {
    return withClient((clientInstance) => clientInstance.get(key), null);
  },

  async setex(key, ttl, value) {
    return withClient((clientInstance) => clientInstance.setEx(key, ttl, value), null);
  },

  async set(key, value, options) {
    return withClient((clientInstance) => clientInstance.set(key, value, options), null);
  },

  async del(...keys) {
    return withClient((clientInstance) => clientInstance.del(...keys), 0);
  },

  async keys(pattern) {
    return withClient((clientInstance) => clientInstance.keys(pattern), []);
  },

  async exists(key) {
    return withClient((clientInstance) => clientInstance.exists(key), 0);
  },

  async lpush(key, value) {
    return withClient((clientInstance) => clientInstance.lPush(key, value), null);
  },

  async expire(key, ttl) {
    return withClient((clientInstance) => clientInstance.expire(key, ttl), null);
  },

  async lrange(key, start, end) {
    return withClient((clientInstance) => clientInstance.lRange(key, start, end), []);
  },

  async quit() {
    if (!resolveClient()) {
      return;
    }

    try {
      await client.quit();
    } catch (error) {
      console.warn('Redis quit failed:', error.message);
    } finally {
      client = null;
    }
  }
};

if (process.env.REDIS_DISABLED !== 'true' && process.env.NODE_ENV !== 'test') {
  createRedisClient().catch((error) => {
    console.error('Redis initialization error:', error.message);
  });
}

module.exports = Object.assign(redisWrapper, {
  createRedisClient,
  getRedisClient,
  testRedisConnection,
});

module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/api.endpoints.test.js'
  ],
  testPathIgnorePatterns: [
    '/tests/disabled/'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/config/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Configurações para evitar EPIPE errors e performance
  maxConcurrency: 1,
  maxWorkers: 1,
  detectOpenHandles: true
};

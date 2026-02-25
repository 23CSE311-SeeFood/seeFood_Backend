module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    // Explicitly exclude E2E tests
    '!**/tests/e2e/**',
  ],
  collectCoverageFrom: [
    'routes/**/*.js',
    'lib/**/*.js',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
};

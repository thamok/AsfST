export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  verbose: true,
  // Run each test file in isolation to avoid native module issues
  maxWorkers: 1,
  // Clear mocks between tests
  clearMocks: true,
  // Reset modules between tests
  resetModules: true,
};

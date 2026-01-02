const path = require('path');

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.(ts|tsx|js)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', { configFile: path.resolve(__dirname, 'babel.jest.config.js') }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@mswjs|msw|until-async|outvariant|headers-polyfill)/)',
  ],
  verbose: true,
};

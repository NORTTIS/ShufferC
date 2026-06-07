/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/shared', '<rootDir>/server', '<rootDir>/client/src'],
  testMatch: ['**/*.test.ts'],
};

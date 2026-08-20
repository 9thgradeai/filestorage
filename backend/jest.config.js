module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/setupFile.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setupS3.ts'],
  globalSetup: '<rootDir>/src/__tests__/setupDb.ts',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|svg|gif|eot|otf|ttf|woff|woff2)$': 'null',
  },
  collectCoverage: true,
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 75,
      lines: 79,
      statements: 79,
    },
  },
  // ts-jest must handle the CJS-only file-type v16 internals via its own transform.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};
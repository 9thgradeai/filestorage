// Global mock of the S3 service so API/integration tests never hit real AWS.
// Runs after the test framework is loaded (setupFilesAfterEnv) and applies to
// every suite that imports the app.

jest.mock('../services/s3.service', () => ({
  s3Upload: jest.fn(async () => ({ key: 'mocked-key' })),
  s3Delete: jest.fn(async () => {}),
  s3Download: jest.fn(async () => {
    const { Readable } = require('stream');
    // Must match the content uploaded by file.controller.test.ts so the
    // download assertion is identical under both the S3 driver (CI, where
    // this mock is used) and the local driver (dev, where bytes come from disk).
    return Readable.from([Buffer.from('Public file content')]);
  }),
  generateShareableLink: jest.fn(async () => 'https://mock-signed-url'),
}));

// Close the application's shared pg pool after all suites so Jest can exit
// without needing --forceExit.
afterAll(async () => {
  const { pool } = require('../config/database');
  if (pool) {
    try {
      await pool.end();
    } catch {
      // already closed
    }
  }
});
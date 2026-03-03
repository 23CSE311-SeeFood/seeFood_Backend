const { test, expect } = require('@playwright/test');

test.describe('Server Health - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  test('should return health check', async ({ request }) => {
    const res = await request.get(`${baseURL}/health`);
    expect(res.status()).toBe(200);
  });
});

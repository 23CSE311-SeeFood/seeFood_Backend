const { test, expect } = require('@playwright/test');

test.describe('Server Health - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  test('should return root endpoint', async ({ request }) => {
    const res = await request.get(`${baseURL}/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('should return health check', async ({ request }) => {
    const res = await request.get(`${baseURL}/health`);
    expect(res.status()).toBe(200);
  });

  test('should handle concurrent requests', async ({ request }) => {
    const requests = Array.from({ length: 5 }, () => request.get(`${baseURL}/`));
    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status()).toBe(200);
    }
  });
});

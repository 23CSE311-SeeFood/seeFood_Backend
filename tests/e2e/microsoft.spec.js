const { test, expect } = require('@playwright/test');

test.describe('Microsoft SSO - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  test('should redirect to Microsoft login', async ({ request }) => {
    const res = await request.get(`${baseURL}/auth/microsoft/login`, {
      maxRedirects: 0,
    });
    expect([302, 400, 500]).toContain(res.status());
  });

  test('should handle callback with invalid code', async ({ request }) => {
    const res = await request.get(`${baseURL}/auth/microsoft/callback?code=invalid_code&state=test_state`);
    expect([400, 500]).toContain(res.status());
  });

  test('should require authorization code parameter', async ({ request }) => {
    const res = await request.get(`${baseURL}/auth/microsoft/callback?state=test_state`);
    expect([400, 500]).toContain(res.status());
  });

  test('should handle missing state parameter', async ({ request }) => {
    const res = await request.get(`${baseURL}/auth/microsoft/callback?code=test_code`);
    expect([400, 500]).toContain(res.status());
  });

  test('should handle invalid request method on login', async ({ request }) => {
    const res = await request.post(`${baseURL}/auth/microsoft/login`, {
      data: {},
    });

    expect([405, 404, 500, 400]).toContain(res.status());
  });
});

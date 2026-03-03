const { test, expect } = require('@playwright/test');

test.describe('Auth - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  test('should register student successfully', async ({ request }) => {
    const res = await request.post(`${baseURL}/auth/register`, {
      data: {
        name: 'User',
        email: `user_${Date.now()}@test.com`,
        number: '9876543210',
        password: 'Pass@123',
      },
    });
    expect(res.status()).toBe(201);
    expect((await res.json())).toHaveProperty('token');
  });

  test('should fail - duplicate email', async ({ request }) => {
    const email = `dup_${Date.now()}@test.com`;
    const first = await request.post(`${baseURL}/auth/register`, {
      data: { name: 'User1', email, number: '1111111111', password: 'Pass@123' },
    });
    if (first.status() !== 201) return;
    const res = await request.post(`${baseURL}/auth/register`, {
      data: { name: 'User2', email, number: '2222222222', password: 'Pass@123' },
    });
    expect(res.status()).toBe(409);
  });

  test('should login successfully', async ({ request }) => {
    const email = `login_${Date.now()}@test.com`;
    const reg = await request.post(`${baseURL}/auth/register`, {
      data: { name: 'User', email, number: '1111111111', password: 'Pass@123' },
    });
    if (reg.status() !== 201) return;
    const res = await request.post(`${baseURL}/auth/login`, {
      data: { email, password: 'Pass@123' },
    });
    expect(res.status()).toBe(200);
  });
});

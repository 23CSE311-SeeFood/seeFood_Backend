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
    expect(first.status()).toBe(201);
    const res = await request.post(`${baseURL}/auth/register`, {
      data: { name: 'User2', email, number: '2222222222', password: 'Pass@123' },
    });
    expect(res.status()).toBe(409);
  });

  test('should fail - missing fields', async ({ request }) => {
    const res = await request.post(`${baseURL}/auth/register`, {
      data: { name: 'Test', email: 'test@test.com' },
    });
    expect(res.status()).toBe(400);
  });

  test('should login successfully', async ({ request }) => {
    const email = `login_${Date.now()}@test.com`;
    const reg = await request.post(`${baseURL}/auth/register`, {
      data: { name: 'User', email, number: '1111111111', password: 'Pass@123' },
    });
    expect(reg.status()).toBe(201);
    const res = await request.post(`${baseURL}/auth/login`, {
      data: { email, password: 'Pass@123' },
    });
    expect(res.status()).toBe(200);
  });

  test('should fail - wrong password', async ({ request }) => {
    const email = `wrong_${Date.now()}@test.com`;
    const reg = await request.post(`${baseURL}/auth/register`, {
      data: { name: 'User', email, number: '1111111111', password: 'Pass@123' },
    });
    expect(reg.status()).toBe(201);
    const res = await request.post(`${baseURL}/auth/login`, {
      data: { email, password: 'Wrong' },
    });
    expect(res.status()).toBe(401);
  });
});

const { test, expect } = require('@playwright/test');

test.describe('Canteens - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  test('should get all canteens', async ({ request }) => {
    const res = await request.get(`${baseURL}/canteens`);
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test('should create canteen', async ({ request }) => {
    const res = await request.post(`${baseURL}/canteens`, {
      data: { name: `Canteen_${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    expect((await res.json())).toHaveProperty('id');
  });

  test('should fail - missing name', async ({ request }) => {
    const res = await request.post(`${baseURL}/canteens`, {
      data: { ratings: 4.5 },
    });
    expect(res.status()).toBe(400);
  });

  test('should delete canteen', async ({ request }) => {
    const create = await request.post(`${baseURL}/canteens`, {
      data: { name: `Canteen_${Date.now()}_del` },
    });
    expect(create.status()).toBe(201);
    const canteenId = (await create.json()).id;

    const res = await request.delete(`${baseURL}/canteens/${canteenId}`);
    expect(res.status()).toBe(204);
  });

  test('should fail - delete non-existent', async ({ request }) => {
    const res = await request.delete(`${baseURL}/canteens/99999`);
    expect(res.status()).toBe(404);
  });
});

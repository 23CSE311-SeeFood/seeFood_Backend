const { test, expect } = require('@playwright/test');

test.describe('Cart - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  test('should add item to cart', async ({ request }) => {
    // Setup
    const student = await request.post(`${baseURL}/auth/register`, {
      data: {
        name: 'User',
        email: `user_${Date.now()}@test.com`,
        number: '1111111111',
        password: 'Pass@123',
      },
    });
    expect(student.status()).toBe(201);
    const studentId = (await student.json()).student.id;

    const canteen = await request.post(`${baseURL}/canteens`, {
      data: { name: `Canteen_${Date.now()}` },
    });
    expect(canteen.status()).toBe(201);
    const canteenId = (await canteen.json()).id;

    const item = await request.post(`${baseURL}/canteens/${canteenId}/items`, {
      data: {
        name: `Item_${Date.now()}`,
        price: 100,
        foodType: 'VEG',
        category: 'CURRIES',
      },
    });
    expect(item.status()).toBe(201);
    const itemId = (await item.json()).id;

    const res = await request.post(`${baseURL}/cart/${studentId}/items`, {
      data: { canteenId, canteenItemId: itemId, quantity: 2 },
    });

    expect(res.status()).toBe(201);
    expect((await res.json())).toHaveProperty('items');
  });

  test('should get cart', async ({ request }) => {
    const student = await request.post(`${baseURL}/auth/register`, {
      data: {
        name: 'User',
        email: `user_${Date.now()}@test.com`,
        number: '1111111111',
        password: 'Pass@123',
      },
    });
    expect(student.status()).toBe(201);
    const studentId = (await student.json()).student.id;

    const res = await request.get(`${baseURL}/cart/${studentId}`);
    expect([200, 404]).toContain(res.status());
  });

  test('should fail - invalid quantity', async ({ request }) => {
    const student = await request.post(`${baseURL}/auth/register`, {
      data: {
        name: 'User',
        email: `user_${Date.now()}@test.com`,
        number: '1111111111',
        password: 'Pass@123',
      },
    });
    expect(student.status()).toBe(201);
    const studentId = (await student.json()).student.id;

    const res = await request.post(`${baseURL}/cart/${studentId}/items`, {
      data: { canteenId: 1, canteenItemId: 1, quantity: 0 },
    });

    expect(res.status()).toBe(400);
  });

  test('should fail - non-existent cart', async ({ request }) => {
    const res = await request.get(`${baseURL}/cart/99999`);
    expect(res.status()).toBe(404);
  });

  test('should calculate cart total', async ({ request }) => {
    const student = await request.post(`${baseURL}/auth/register`, {
      data: {
        name: 'User',
        email: `user_${Date.now()}@test.com`,
        number: '1111111111',
        password: 'Pass@123',
      },
    });
    expect(student.status()).toBe(201);
    const studentId = (await student.json()).student.id;

    const canteen = await request.post(`${baseURL}/canteens`, {
      data: { name: `Canteen_${Date.now()}` },
    });
    expect(canteen.status()).toBe(201);
    const canteenId = (await canteen.json()).id;

    const item = await request.post(`${baseURL}/canteens/${canteenId}/items`, {
      data: {
        name: `Item_${Date.now()}`,
        price: 100,
        foodType: 'VEG',
        category: 'CURRIES',
      },
    });
    expect(item.status()).toBe(201);
    const itemId = (await item.json()).id;

    const res = await request.post(`${baseURL}/cart/${studentId}/items`, {
      data: { canteenId, canteenItemId: itemId, quantity: 2 },
    });
    expect(res.status()).toBe(201);
    const cart = await res.json();
    expect(cart.total).toBe(200); // 2 * 100
  });
});

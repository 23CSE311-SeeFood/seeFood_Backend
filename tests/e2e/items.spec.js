const { test, expect } = require('@playwright/test');

test.describe('Items - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  test('should create item', async ({ request }) => {
    const canteen = await request.post(`${baseURL}/canteens`, {
      data: { name: `Canteen_${Date.now()}` },
    });
    expect(canteen.status()).toBe(201);
    const canteenId = (await canteen.json()).id;

    const res = await request.post(`${baseURL}/canteens/${canteenId}/items`, {
      data: {
        name: `Item_${Date.now()}`,
        price: 100,
        foodType: 'VEG',
        category: 'CURRIES',
      },
    });

    expect(res.status()).toBe(201);
    expect((await res.json())).toHaveProperty('id');
  });

  test('should fail - invalid foodType', async ({ request }) => {
    const canteen = await request.post(`${baseURL}/canteens`, {
      data: { name: `Canteen_${Date.now()}` },
    });
    expect(canteen.status()).toBe(201);
    const canteenId = (await canteen.json()).id;

    const res = await request.post(`${baseURL}/canteens/${canteenId}/items`, {
      data: {
        name: 'Item',
        price: 100,
        foodType: 'INVALID',
        category: 'CURRIES',
      },
    });

    expect(res.status()).toBe(400);
  });

  test('should fail - invalid category', async ({ request }) => {
    const canteen = await request.post(`${baseURL}/canteens`, {
      data: { name: `Canteen_${Date.now()}` },
    });
    expect(canteen.status()).toBe(201);
    const canteenId = (await canteen.json()).id;

    const res = await request.post(`${baseURL}/canteens/${canteenId}/items`, {
      data: {
        name: 'Item',
        price: 100,
        foodType: 'VEG',
        category: 'INVALID',
      },
    });

    expect(res.status()).toBe(400);
  });

  test('should fail - missing price', async ({ request }) => {
    const canteen = await request.post(`${baseURL}/canteens`, {
      data: { name: `Canteen_${Date.now()}` },
    });
    expect(canteen.status()).toBe(201);
    const canteenId = (await canteen.json()).id;

    const res = await request.post(`${baseURL}/canteens/${canteenId}/items`, {
      data: {
        name: 'Item',
        foodType: 'VEG',
        category: 'CURRIES',
      },
    });

    expect(res.status()).toBe(400);
  });

  test('should update item', async ({ request }) => {
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

    const res = await request.put(`${baseURL}/canteens/${canteenId}/items/${itemId}`, {
      data: { price: 150 },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).price).toBe(150);
  });

  test('should delete item', async ({ request }) => {
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

    const res = await request.delete(`${baseURL}/canteens/${canteenId}/items/${itemId}`);
    expect(res.status()).toBe(204);
  });
});

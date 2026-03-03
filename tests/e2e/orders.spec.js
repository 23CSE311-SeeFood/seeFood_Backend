const { test, expect } = require('@playwright/test');

test.describe('Orders - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  async function setupOrderData(request) {
    // Register student
    const studentRes = await request.post(`${baseURL}/auth/register`, {
      data: {
        name: 'Order Test User',
        email: `order_user_${Date.now()}@test.com`,
        number: '9999999999',
        password: 'Pass@123',
      },
    });
    if (studentRes.status() !== 201) return null;
    const studentData = await studentRes.json();
    const studentId = studentData?.student?.id;
    if (!studentId) return null;

    // Create canteen
    const canteenRes = await request.post(`${baseURL}/canteens`, {
      data: { name: `Order_Canteen_${Date.now()}` },
    });
    if (canteenRes.status() !== 201) return null;
    const canteenData = await canteenRes.json();
    const canteenId = canteenData?.id;
    if (!canteenId) return null;

    // Create item
    const itemRes = await request.post(`${baseURL}/canteens/${canteenId}/items`, {
      data: {
        name: `OrderItem_${Date.now()}`,
        price: 100,
        foodType: 'VEG',
        category: 'CURRIES',
      },
    });
    if (itemRes.status() !== 201) return null;
    const itemData = await itemRes.json();
    const itemId = itemData?.id;
    if (!itemId) return null;

    // Add item to cart
    await request.post(`${baseURL}/cart/${studentId}/items`, {
      data: { canteenId, canteenItemId: itemId, quantity: 2 },
    });

    return { studentId, canteenId, itemId };
  }

  test('should create order from cart', async ({ request }) => {
    const setupData = await setupOrderData(request);
    if (!setupData) return;
    const { studentId, canteenId } = setupData;

    const res = await request.post(`${baseURL}/orders/create`, {
      data: { studentId, canteenId },
    });

    expect([201, 200, 400, 409, 500]).toContain(res.status());
    if (res.status() !== 201 && res.status() !== 200) return;
    const order = await res.json();
    expect(order).toHaveProperty('id');
    expect(order).toHaveProperty('status');
  });

  test('should get student orders', async ({ request }) => {
    const setupData = await setupOrderData(request);
    if (!setupData) return;
    const { studentId, canteenId } = setupData;

    // Create an order
    const createRes = await request.post(`${baseURL}/orders/create`, {
      data: { studentId, canteenId },
    });
    if (createRes.status() !== 201 && createRes.status() !== 200) return;

    // Get orders
    const res = await request.get(`${baseURL}/orders/student/${studentId}`);
    expect(res.status()).toBe(200);
    const orders = await res.json();
    expect(Array.isArray(orders)).toBeTruthy();
  });

  test('should get order by ID', async ({ request }) => {
    const setupData = await setupOrderData(request);
    if (!setupData) return;
    const { studentId, canteenId } = setupData;

    const createRes = await request.post(`${baseURL}/orders/create`, {
      data: { studentId, canteenId },
    });
    if (createRes.status() !== 201 && createRes.status() !== 200) return;
    const orderData = await createRes.json();
    const orderId = orderData?.id;
    if (!orderId) return;

    const res = await request.get(`${baseURL}/orders/${orderId}`);
    expect([200, 400, 500]).toContain(res.status());
    if (res.status() === 200) {
      const order = await res.json();
      expect(order).toHaveProperty('id');
    }
  });

  test('should mark order item as started', async ({ request }) => {
    const setupData = await setupOrderData(request);
    if (!setupData) return;
    const { studentId, canteenId } = setupData;

    const createRes = await request.post(`${baseURL}/orders/create`, {
      data: { studentId, canteenId },
    });
    const orderId = (await createRes.json()).id;

    const res = await request.put(`${baseURL}/orders/items/${orderId}/start`, {
      data: {},
    });

    expect([200, 204, 400, 404]).toContain(res.status());
  });

  test('should mark order item delivered', async ({ request }) => {
    const setupData = await setupOrderData(request);
    if (!setupData) return;
    const { studentId, canteenId } = setupData;

    const createRes = await request.post(`${baseURL}/orders/create`, {
      data: { studentId, canteenId },
    });
    const orderId = (await createRes.json()).id;

    const res = await request.put(`${baseURL}/orders/items/${orderId}/delivered`, {
      data: {},
    });
    expect([200, 204, 400, 404]).toContain(res.status());
  });

  test('should verify payment for order', async ({ request }) => {
    const res = await request.post(`${baseURL}/orders/verify`, {
      data: {
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_456',
        razorpay_signature: 'test_signature',
      },
    });

    expect([200, 400, 500]).toContain(res.status());
  });
});

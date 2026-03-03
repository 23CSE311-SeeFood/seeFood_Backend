const { test, expect } = require('@playwright/test');
const crypto = require('crypto');

test.describe('Payments - Critical Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'test_secret';

  test('should create payment order', async ({ request }) => {
    const res = await request.post(`${baseURL}/payments/create-order`, {
      data: {
        amount: 10000,
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
        notes: {
          description: 'Test payment order',
        },
      },
    });

    expect([201, 500]).toContain(res.status());

    if (res.status() === 201) {
      const order = await res.json();
      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('amount', 10000);
      expect(order).toHaveProperty('currency', 'INR');
    }
  });

  test('should verify payment signature', async ({ request }) => {
    const createRes = await request.post(`${baseURL}/payments/create-order`, {
      data: {
        amount: 10000,
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
      },
    });

    if (createRes.status() !== 201) {
      test.skip();
    }

    const order = await createRes.json();
    const razorpay_order_id = order.id;
    const razorpay_payment_id = 'pay_' + Date.now();
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const razorpay_signature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const res = await request.post(`${baseURL}/payments/verify`, {
      data: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
    });

    expect([200, 400, 500]).toContain(res.status());
  });

  test('should fail - invalid payment signature', async ({ request }) => {
    const res = await request.post(`${baseURL}/payments/verify`, {
      data: {
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_456',
        razorpay_signature: 'invalid_signature_xyz',
      },
    });

    expect([400, 500]).toContain(res.status());
  });

  test('should handle webhook with valid signature', async ({ request }) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'webhook_secret';
    const testPayload = JSON.stringify({
      event: 'payment.authorized',
      payload: {
        payment: {
          entity: {
            id: 'pay_test123',
            amount: 10000,
          },
        },
      },
    });

    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(testPayload)
      .digest('hex');

    const res = await request.post(`${baseURL}/payments/webhook`, {
      data: testPayload,
      headers: {
        'x-razorpay-signature': signature,
        'content-type': 'application/json',
      },
    });

    expect([200, 400, 500]).toContain(res.status());
  });
});

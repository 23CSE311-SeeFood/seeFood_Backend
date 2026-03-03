const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

jest.mock('../../lib/prisma', () => ({
  order: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  orderItem: {
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
}));

jest.mock('../../lib/redis', () => ({
  getRedis: jest.fn(),
}));

jest.mock('../../lib/ws', () => ({
  broadcastToCanteen: jest.fn(),
}));

const prisma = require('../../lib/prisma');
const { getRedis } = require('../../lib/redis');
const { broadcastToCanteen } = require('../../lib/ws');
const ordersRouter = require('../../routes/orders');

const app = express();
app.use(express.json());
app.use('/orders', ordersRouter);

const redisClient = {
  incr: jest.fn(),
  expire: jest.fn(),
  zAdd: jest.fn(),
  zRank: jest.fn(),
  zRem: jest.fn(),
};

const originalEnv = { ...process.env };

describe('Orders Queue System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    getRedis.mockResolvedValue(redisClient);
  });

  describe('GET /orders/:id/queue', () => {
    it('returns 400 for non-integer id', async () => {
      const res = await request(app).get('/orders/abc/queue');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'id must be an integer' });
    });

    it('returns 404 when order or token not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/orders/1/queue');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Order not found' });
      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { items: { include: { canteenItem: true } } },
      });
    });

    it('returns queue info with per-station positions', async () => {
      const createdAt = new Date('2025-02-25T10:00:00Z');
      const order = {
        id: 10,
        canteenId: 1,
        tokenNumber: 5,
        status: 'PAID',
        createdAt,
        items: [
          {
            id: 1001,
            canteenItemId: 11,
            quantity: 2,
            canteenItem: { category: 'RICE', name: 'Rice Bowl' },
          },
          {
            id: 1002,
            canteenItemId: 12,
            quantity: 1,
            canteenItem: { category: 'DRINKS', name: 'Cola' },
          },
        ],
      };
      prisma.order.findUnique.mockResolvedValue(order);

      redisClient.zRank
        .mockResolvedValueOnce(0) // first item position
        .mockResolvedValueOnce(2); // second item position

      const res = await request(app).get('/orders/10/queue');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        orderId: 10,
        tokenNumber: 5,
        orderStatus: 'PAID',
        queues: [
          { station: 'RICE', orderItemId: 1001, position: 1 },
          { station: 'DRINKS', orderItemId: 1002, position: 3 },
        ],
      });

      // Ensure Redis was queried with expected keys and payloads
      expect(redisClient.zRank).toHaveBeenCalledTimes(2);
      const firstCall = redisClient.zRank.mock.calls[0];
      const secondCall = redisClient.zRank.mock.calls[1];

      const dateKey = '20250225';
      expect(firstCall[0]).toBe(`queue:1:RICE:${dateKey}`);
      expect(secondCall[0]).toBe(`queue:1:DRINKS:${dateKey}`);

      const firstPayload = JSON.parse(firstCall[1]);
      const secondPayload = JSON.parse(secondCall[1]);

      expect(firstPayload).toMatchObject({
        orderId: 10,
        orderItemId: 1001,
        tokenNumber: 5,
        canteenItemId: 11,
        quantity: 2,
        category: 'RICE',
        station: 'RICE',
      });
      expect(secondPayload).toMatchObject({
        orderId: 10,
        orderItemId: 1002,
        tokenNumber: 5,
        canteenItemId: 12,
        quantity: 1,
        category: 'DRINKS',
        station: 'DRINKS',
      });
    });
  });

  describe('PUT /orders/items/:orderItemId/ready', () => {
    it('returns 400 for non-integer id', async () => {
      const res = await request(app).put('/orders/items/abc/ready');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'orderItemId must be an integer' });
    });

    it('removes item from queue and broadcasts when order has token', async () => {
      const createdAt = new Date('2025-02-25T09:00:00Z');
      const order = {
        id: 10,
        canteenId: 2,
        createdAt,
        tokenNumber: 42,
        status: 'PAID',
      };

      const fullItem = {
        id: 1001,
        orderId: 10,
        canteenItemId: 21,
        quantity: 1,
        canteenItem: { category: 'RICE', name: 'Rice Dish' },
      };

      prisma.orderItem.update.mockResolvedValue({ id: 1001, orderId: 10 });
      prisma.order.findUnique.mockResolvedValue(order);
      prisma.orderItem.findMany.mockResolvedValue([
        { status: 'READY' },
      ]);
      prisma.orderItem.findUnique.mockResolvedValue(fullItem);

      // For queue info after update
      prisma.order.findUnique.mockResolvedValueOnce(order).mockResolvedValueOnce({
        ...order,
        items: [fullItem],
      });
      redisClient.zRank.mockResolvedValue(null);

      const res = await request(app).put('/orders/items/1001/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });

      const dateKey = '20250225';
      expect(redisClient.zRem).toHaveBeenCalledWith(
        `queue:2:RICE:${dateKey}`,
        expect.any(String)
      );

      expect(broadcastToCanteen).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ type: 'queue_update', orderId: 10 })
      );
    });

    it('does not touch queue or broadcast when order has no token', async () => {
      prisma.orderItem.update.mockResolvedValue({ id: 1001, orderId: 10 });
      prisma.order.findUnique.mockResolvedValue({
        id: 10,
        canteenId: 2,
        createdAt: new Date(),
        tokenNumber: null,
      });
      prisma.orderItem.findMany.mockResolvedValue([{ status: 'READY' }]);

      const res = await request(app).put('/orders/items/1001/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(redisClient.zRem).not.toHaveBeenCalled();
    });
  });

  describe('PUT /orders/items/:orderItemId/delivered', () => {
    it('marks delivered, updates order status, and updates queue', async () => {
      const createdAt = new Date('2025-02-25T09:00:00Z');
      const order = {
        id: 10,
        canteenId: 3,
        createdAt,
        tokenNumber: 7,
        status: 'PAID',
      };

      const fullItem = {
        id: 2001,
        orderId: 10,
        canteenItemId: 31,
        quantity: 2,
        canteenItem: { category: 'DRINKS', name: 'Juice' },
      };

      prisma.orderItem.update.mockResolvedValue({ id: 2001, orderId: 10 });
      prisma.order.findUnique.mockResolvedValue(order);
      prisma.orderItem.findMany.mockResolvedValue([
        { status: 'DELIVERED' },
      ]);
      prisma.orderItem.findUnique.mockResolvedValue(fullItem);

      // For queue info after update
      prisma.order.findUnique.mockResolvedValueOnce(order).mockResolvedValueOnce({
        ...order,
        items: [fullItem],
      });
      redisClient.zRank.mockResolvedValue(null);

      const res = await request(app).put('/orders/items/2001/delivered');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });

      const dateKey = '20250225';
      expect(redisClient.zRem).toHaveBeenCalledWith(
        `queue:3:DRINKS:${dateKey}`,
        expect.any(String)
      );

      expect(broadcastToCanteen).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ type: 'queue_update', orderId: 10 })
      );
    });
  });

  describe('POST /orders/verify', () => {
    it('assigns token, enqueues items, and broadcasts on successful payment', async () => {
      process.env.RAZORPAY_KEY_ID = 'key-id';
      process.env.RAZORPAY_KEY_SECRET = 'secret';

      const systemDate = new Date('2025-02-25T08:00:00Z');
      jest.useFakeTimers().setSystemTime(systemDate);

      const items = [
        {
          id: 3001,
          canteenItemId: 41,
          quantity: 1,
          canteenItem: { category: 'RICE', name: 'Rice Dish' },
        },
      ];

      const orderBeforeQueue = {
        id: 20,
        canteenId: 4,
        tokenNumber: null,
        createdAt: systemDate,
        status: 'PAID',
        items,
      };

      const orderWithToken = {
        ...orderBeforeQueue,
        tokenNumber: 1,
      };

      prisma.order.update.mockResolvedValue({
        id: 20,
        canteenId: 4,
        tokenNumber: null,
        items,
      });

      prisma.order.findUnique
        .mockResolvedValueOnce(orderBeforeQueue) // assignTokenAndQueue fetch
        .mockResolvedValueOnce(orderWithToken); // getOrderQueueInfo fetch

      redisClient.incr.mockResolvedValue(1);
      redisClient.expire.mockResolvedValue(1);
      redisClient.zAdd.mockResolvedValue(1);
      redisClient.zRank.mockResolvedValue(0);

      const razorpay_order_id = 'order_123';
      const razorpay_payment_id = 'pay_456';
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const razorpay_signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      const res = await request(app)
        .post('/orders/verify')
        .send({
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('verified');
      expect(res.body.order.tokenNumber).toBe(1);

      const dateKey = '20250225';
      expect(redisClient.incr).toHaveBeenCalledWith(`token:4:${dateKey}`);
      expect(redisClient.zAdd).toHaveBeenCalledTimes(1);
      expect(broadcastToCanteen).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ type: 'queue_update', orderId: 20, tokenNumber: 1 })
      );

      jest.useRealTimers();
    });
  });
});
